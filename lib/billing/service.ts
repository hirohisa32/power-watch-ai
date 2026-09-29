import "server-only";
import { and, desc, eq, isNull, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  apiUsage,
  finalRenders,
  monthlyBillingSettlements,
  projectCostSettlements,
} from "@/lib/db/schema";
import {
  applyIncrementalCost,
  assertBillingMonth,
  jstBillingMonth,
  nextBillingMonth,
  roundUsd,
} from "./calculations";
import { type ExchangeRateProvider, FrankfurterEcbExchangeRateProvider } from "./exchange-rate";

export async function settleCompletedRender(
  renderId: string,
  exchange: ExchangeRateProvider = new FrankfurterEcbExchangeRateProvider(),
) {
  const db = getDb();
  const [render] = await db
    .select()
    .from(finalRenders)
    .where(and(eq(finalRenders.id, renderId), eq(finalRenders.status, "completed")))
    .limit(1);
  if (!render?.completedAt) throw new Error("完成済みRenderが見つかりません");

  const [existing] = await db
    .select()
    .from(projectCostSettlements)
    .where(eq(projectCostSettlements.renderId, renderId))
    .limit(1);
  if (existing?.status === "fixed") return existing;

  let pending = existing;
  if (!pending) {
    const [[cost], [previous]] = await Promise.all([
      db
        .select({
          total: sql<number>`coalesce(sum(${apiUsage.estimatedCost}), 0)::double precision`,
        })
        .from(apiUsage)
        .where(
          and(
            eq(apiUsage.projectId, render.projectId),
            lte(apiUsage.createdAt, render.completedAt),
            ne(apiUsage.operation, "video_generation_submit"),
          ),
        ),
      db
        .select()
        .from(projectCostSettlements)
        .where(eq(projectCostSettlements.projectId, render.projectId))
        .orderBy(desc(projectCostSettlements.costThrough))
        .limit(1),
    ]);
    const totalCostUsd = roundUsd(cost.total);
    const previousTotalCostUsd = previous?.totalCostUsd ?? 0;
    [pending] = await db
      .insert(projectCostSettlements)
      .values({
        projectId: render.projectId,
        renderId,
        totalCostUsd,
        previousTotalCostUsd,
        incrementalCostUsd: Math.max(0, roundUsd(totalCostUsd - previousTotalCostUsd)),
        costThrough: render.completedAt,
      })
      .onConflictDoNothing({ target: projectCostSettlements.renderId })
      .returning();
    if (!pending)
      [pending] = await db
        .select()
        .from(projectCostSettlements)
        .where(eq(projectCostSettlements.renderId, renderId))
        .limit(1);
  }
  return finalizePendingSettlement(pending.id, exchange);
}

export async function finalizePendingSettlement(
  settlementId: string,
  exchange: ExchangeRateProvider = new FrankfurterEcbExchangeRateProvider(),
) {
  const db = getDb();
  const [pending] = await db
    .select()
    .from(projectCostSettlements)
    .where(eq(projectCostSettlements.id, settlementId))
    .limit(1);
  if (!pending) throw new Error("コスト確定データが見つかりません");
  if (pending.status === "fixed") return pending;

  const quote = await exchange.getUsdJpy();
  const fixedAt = new Date();
  let billingMonth = jstBillingMonth(fixedAt);
  while (true) {
    const [month] = await db
      .select({ status: monthlyBillingSettlements.status })
      .from(monthlyBillingSettlements)
      .where(eq(monthlyBillingSettlements.billingMonth, billingMonth))
      .limit(1);
    if (month?.status !== "closed") break;
    billingMonth = nextBillingMonth(billingMonth);
  }
  const [previousFixed] = await db
    .select({ totalCostJpy: projectCostSettlements.totalCostJpy })
    .from(projectCostSettlements)
    .where(
      and(
        eq(projectCostSettlements.projectId, pending.projectId),
        eq(projectCostSettlements.status, "fixed"),
        lte(projectCostSettlements.costThrough, pending.costThrough),
      ),
    )
    .orderBy(desc(projectCostSettlements.costThrough))
    .limit(1);
  const converted = applyIncrementalCost({
    previousTotalUsd: pending.previousTotalCostUsd,
    currentTotalUsd: pending.totalCostUsd,
    previousTotalJpy: previousFixed?.totalCostJpy ?? 0,
    usdJpyRate: quote.rate,
  });

  await db
    .insert(monthlyBillingSettlements)
    .values({ billingMonth })
    .onConflictDoNothing({ target: monthlyBillingSettlements.billingMonth });
  const [fixed] = await db
    .update(projectCostSettlements)
    .set({
      incrementalCostUsd: converted.incrementalUsd,
      exchangeRateUsdJpy: quote.rate,
      totalCostJpy: converted.totalJpy,
      incrementalCostJpy: converted.incrementalJpy,
      exchangeRateSource: quote.source,
      ratePublishedAt: quote.publishedAt,
      fixedAt,
      billingMonth,
      status: "fixed",
      updatedAt: fixedAt,
    })
    .where(
      and(
        eq(projectCostSettlements.id, settlementId),
        eq(projectCostSettlements.status, "pending_rate"),
      ),
    )
    .returning();
  return fixed ?? pending;
}

export async function closeBillingMonth(month: string, closedAt = new Date()) {
  assertBillingMonth(month);
  const db = getDb();
  return db.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`billing:${month}`}))`);
    const [existing] = await transaction
      .select()
      .from(monthlyBillingSettlements)
      .where(eq(monthlyBillingSettlements.billingMonth, month))
      .limit(1);
    if (existing?.status === "closed") return existing;
    const [pending] = await transaction
      .select({ value: sql<number>`count(*)::integer` })
      .from(projectCostSettlements)
      .where(eq(projectCostSettlements.status, "pending_rate"));
    if (pending.value > 0)
      throw new Error("為替レート未確定の動画があります。確定後に月締めしてください");
    const [monthly] = existing
      ? [existing]
      : await transaction
          .insert(monthlyBillingSettlements)
          .values({ billingMonth: month })
          .returning();
    const [totals] = await transaction
      .select({
        totalJpy: sql<number>`coalesce(sum(${projectCostSettlements.incrementalCostJpy}), 0)::integer`,
        projectCount: sql<number>`count(distinct ${projectCostSettlements.projectId})::integer`,
      })
      .from(projectCostSettlements)
      .where(
        and(
          eq(projectCostSettlements.billingMonth, month),
          eq(projectCostSettlements.status, "fixed"),
          isNull(projectCostSettlements.monthlyBillingSettlementId),
        ),
      );
    await transaction
      .update(projectCostSettlements)
      .set({ monthlyBillingSettlementId: monthly.id, updatedAt: closedAt })
      .where(
        and(
          eq(projectCostSettlements.billingMonth, month),
          eq(projectCostSettlements.status, "fixed"),
          isNull(projectCostSettlements.monthlyBillingSettlementId),
        ),
      );
    const [closed] = await transaction
      .update(monthlyBillingSettlements)
      .set({
        totalJpy: totals.totalJpy,
        projectCount: totals.projectCount,
        status: "closed",
        closedAt,
        updatedAt: closedAt,
      })
      .where(eq(monthlyBillingSettlements.id, monthly.id))
      .returning();
    return closed;
  });
}
