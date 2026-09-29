import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { jstBillingMonth } from "@/lib/billing/calculations";
import { getDb } from "@/lib/db";
import {
  apiUsage,
  monthlyBillingSettlements,
  projectCostSettlements,
  projects,
  renderJobs,
  videoGenerations,
} from "@/lib/db/schema";
import { isAdminEmail } from "@/lib/ui/presentation";
import { BillingActions } from "./billing-actions";

export const metadata: Metadata = { title: "管理" };
export const dynamic = "force-dynamic";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const jstDate = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  const db = getDb();
  const [usage, generations, jobs, [projectCount], costs, monthly] = await Promise.all([
    db.select().from(apiUsage).orderBy(desc(apiUsage.createdAt)).limit(100),
    db.select().from(videoGenerations).orderBy(desc(videoGenerations.createdAt)).limit(50),
    db.select().from(renderJobs).orderBy(desc(renderJobs.createdAt)).limit(50),
    db.select({ value: sql<number>`count(*)` }).from(projects),
    db
      .select({
        id: projectCostSettlements.id,
        projectId: projectCostSettlements.projectId,
        title: projects.title,
        totalCostUsd: projectCostSettlements.totalCostUsd,
        incrementalCostUsd: projectCostSettlements.incrementalCostUsd,
        exchangeRateUsdJpy: projectCostSettlements.exchangeRateUsdJpy,
        totalCostJpy: projectCostSettlements.totalCostJpy,
        incrementalCostJpy: projectCostSettlements.incrementalCostJpy,
        exchangeRateSource: projectCostSettlements.exchangeRateSource,
        fixedAt: projectCostSettlements.fixedAt,
        billingMonth: projectCostSettlements.billingMonth,
        status: projectCostSettlements.status,
      })
      .from(projectCostSettlements)
      .innerJoin(projects, eq(projects.id, projectCostSettlements.projectId))
      .orderBy(desc(projectCostSettlements.createdAt))
      .limit(500),
    db
      .select()
      .from(monthlyBillingSettlements)
      .orderBy(desc(monthlyBillingSettlements.billingMonth)),
  ]);
  const providerTotals = usage.reduce<Record<string, number>>((all, row) => {
    all[row.provider] = (all[row.provider] ?? 0) + (row.estimatedCost ?? 0);
    return all;
  }, {});
  const total =
    Object.values(providerTotals).reduce((sum, value) => sum + value, 0) +
    generations.reduce((sum, row) => sum + (row.actualCostUsd ?? row.estimatedCostUsd ?? 0), 0);
  const currentMonth = jstBillingMonth(new Date());
  const requested = (await searchParams).month;
  const selectedMonth =
    requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : currentMonth;
  const monthKeys = Array.from(
    new Set([
      currentMonth,
      ...monthly.map((row) => row.billingMonth),
      ...costs.flatMap((row) => (row.billingMonth ? [row.billingMonth] : [])),
    ]),
  )
    .sort()
    .reverse();
  const selectedCosts = costs.filter(
    (row) => row.billingMonth === selectedMonth && row.status === "fixed",
  );
  const pendingRates = costs.filter((row) => row.status === "pending_rate");
  const selectedClosed = monthly.find(
    (row) => row.billingMonth === selectedMonth && row.status === "closed",
  );
  const selectedTotal =
    selectedClosed?.totalJpy ??
    selectedCosts.reduce((sum, row) => sum + (row.incrementalCostJpy ?? 0), 0);
  const selectedProjects =
    selectedClosed?.projectCount ?? new Set(selectedCosts.map((row) => row.projectId)).size;
  const currentClosed = monthly.find(
    (row) => row.billingMonth === currentMonth && row.status === "closed",
  );
  const currentCosts = costs.filter(
    (row) => row.billingMonth === currentMonth && row.status === "fixed",
  );
  const currentTotal =
    currentClosed?.totalJpy ??
    currentCosts.reduce((sum, row) => sum + (row.incrementalCostJpy ?? 0), 0);
  const currentProjects =
    currentClosed?.projectCount ?? new Set(currentCosts.map((row) => row.projectId)).size;
  const [year, month] = currentMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <p className="eyebrow">管理者専用</p>
          <h1>運用状況</h1>
          <p className="lead">API利用量、生成実費、処理状況、エラーを確認できます。</p>
        </div>
        <Link href="/admin/bgm" className="btn">BGMライブラリ</Link>
      </div>
      <section className="billing-hero">
        <div>
          <p className="eyebrow">今月の請求予定額</p>
          <strong>{yen.format(currentTotal)}</strong>
          <p>
            {year}年{month}月1日〜{month}月{lastDay}日（JST）
          </p>
        </div>
        <div>
          <span>今月の完成動画</span>
          <strong>{currentProjects}本</strong>
        </div>
        <div>
          <span>1本あたり平均</span>
          <strong>
            {yen.format(currentProjects ? Math.round(currentTotal / currentProjects) : 0)}
          </strong>
        </div>
        <div>
          <span>状態</span>
          <strong className="billing-status">{currentClosed ? "締め済み" : "未締め"}</strong>
        </div>
      </section>
      {pendingRates.length > 0 && (
        <section className="panel admin-section billing-warning">
          <h2>為替レート未確定</h2>
          <p>
            為替レートを取得できませんでした。動画のUSD実費は保持されています。再取得すると請求額を確定します。
          </p>
          <div className="billing-list">
            {pendingRates.map((item) => (
              <div key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small>{usd.format(item.totalCostUsd)}</small>
                </span>
                <BillingActions settlementId={item.id} />
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="panel admin-section">
        <div className="billing-section-head">
          <div>
            <p className="eyebrow">請求管理</p>
            <h2>月別請求額</h2>
          </div>
          {!selectedClosed && <BillingActions month={selectedMonth} />}
        </div>
        <div className="billing-months">
          {monthKeys.map((key) => {
            const closed = monthly.find(
              (row) => row.billingMonth === key && row.status === "closed",
            );
            const rows = costs.filter((row) => row.billingMonth === key && row.status === "fixed");
            const amount =
              closed?.totalJpy ?? rows.reduce((sum, row) => sum + (row.incrementalCostJpy ?? 0), 0);
            const count = closed?.projectCount ?? new Set(rows.map((row) => row.projectId)).size;
            return (
              <Link
                key={key}
                className={key === selectedMonth ? "active" : ""}
                href={`/admin?month=${key}`}
              >
                <strong>{formatMonth(key)}</strong>
                <span>
                  {yen.format(amount)} · {count}本 · {closed ? "締め済み" : "未締め"}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="billing-selected-summary">
          <strong>{formatMonth(selectedMonth)}</strong>
          <span>
            {yen.format(selectedTotal)} · {selectedProjects}本
          </span>
        </div>
        <div className="billing-table" role="table" aria-label="動画別請求内訳">
          <div className="billing-table-head" role="row">
            <span>動画タイトル</span>
            <span>完成日</span>
            <span>USD実費</span>
            <span>確定USD/JPY</span>
            <span>確定日本円</span>
            <span>状態</span>
          </div>
          {selectedCosts.map((item) => (
            <div key={item.id} role="row">
              <span>
                <strong>{item.title}</strong>
                {item.incrementalCostUsd !== item.totalCostUsd && (
                  <small>追加費用（累計 {usd.format(item.totalCostUsd)}）</small>
                )}
              </span>
              <span>{item.fixedAt ? jstDate.format(item.fixedAt) : "—"}</span>
              <span>{usd.format(item.incrementalCostUsd)}</span>
              <span>
                {item.exchangeRateUsdJpy?.toFixed(4)}円<small>{item.exchangeRateSource}</small>
              </span>
              <span>
                {yen.format(item.incrementalCostJpy ?? 0)}
                {item.incrementalCostJpy !== item.totalCostJpy && (
                  <small>動画累計 {yen.format(item.totalCostJpy ?? 0)}</small>
                )}
              </span>
              <span className="billing-fixed">確定</span>
            </div>
          ))}
          {selectedCosts.length === 0 && (
            <p className="empty-state">この月の確定費用はまだありません。</p>
          )}
        </div>
      </section>
      <section className="admin-summary">
        <div>
          <span>動画数</span>
          <strong>{projectCount.value}</strong>
        </div>
        <div>
          <span>記録済み生成実費</span>
          <strong>${total.toFixed(2)}</strong>
        </div>
        <div>
          <span>処理中Job</span>
          <strong>
            {jobs.filter((job) => ["queued", "processing"].includes(job.status)).length}
          </strong>
        </div>
        <div>
          <span>要確認</span>
          <strong>
            {jobs.filter((job) => job.status === "failed").length +
              generations.filter((item) => item.status === "failed").length}
          </strong>
        </div>
      </section>
      <section className="panel admin-section">
        <h2>サービス別利用実費</h2>
        <div className="admin-table">
          {Object.entries(providerTotals).map(([provider, amount]) => (
            <div key={provider}>
              <span>{provider}</span>
              <span>${amount.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="panel admin-section">
        <h2>映像生成履歴</h2>
        <div className="admin-table">
          {generations.map((item) => (
            <div key={item.id}>
              <span>
                {item.provider} / {item.model} / v{item.version}
              </span>
              <span>
                {item.status}
                {item.errorCode ? ` · ${item.errorCode}` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="panel admin-section">
        <h2>最終動画Job</h2>
        <div className="admin-table">
          {jobs.map((job) => (
            <div key={job.id}>
              <span>{job.id}</span>
              <span>
                {job.status}
                {job.errorCode ? ` · ${job.errorCode}` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function formatMonth(month: string) {
  const [year, value] = month.split("-");
  return `${year}年${Number(value)}月`;
}
