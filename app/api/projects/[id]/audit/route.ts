import { and, count, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  apiUsage,
  assets,
  projects,
  scenes,
  storyboards,
  videoGenerations,
  videoJobs,
} from "@/lib/db/schema";
import { apiError } from "@/lib/http";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id } = await params;
    const db = getDb();
    const [project] = await db
      .select({ id: projects.id, status: projects.status, targetDuration: projects.targetDuration })
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
      .limit(1);
    if (!project)
      return NextResponse.json({ error: "プロジェクトが見つかりません" }, { status: 404 });

    const [assetSummary, activeStoryboard, generationRows, jobRows, usageRows] = await Promise.all([
      db.select({ count: count() }).from(assets).where(eq(assets.projectId, id)),
      db
        .select({
          id: storyboards.id,
          version: storyboards.version,
          totalDuration: storyboards.totalDuration,
        })
        .from(storyboards)
        .where(and(eq(storyboards.projectId, id), eq(storyboards.isActive, true)))
        .limit(1),
      db
        .select({
          id: videoGenerations.id,
          status: videoGenerations.status,
          model: videoGenerations.model,
          requestedDuration: videoGenerations.requestedDuration,
          estimatedCostCredits: videoGenerations.estimatedCostCredits,
          estimatedCostUsd: videoGenerations.estimatedCostUsd,
          actualCostCredits: videoGenerations.actualCostCredits,
          actualCostUsd: videoGenerations.actualCostUsd,
          outputObjectKey: videoGenerations.outputObjectKey,
        })
        .from(videoGenerations)
        .where(eq(videoGenerations.projectId, id))
        .orderBy(desc(videoGenerations.createdAt)),
      db
        .select({
          generationId: videoJobs.generationId,
          status: videoJobs.status,
          attempts: videoJobs.attempts,
          providerTaskId: videoJobs.providerTaskId,
          errorCode: videoJobs.errorCode,
        })
        .from(videoJobs)
        .where(eq(videoJobs.projectId, id))
        .orderBy(desc(videoJobs.createdAt)),
      db
        .select({
          provider: apiUsage.provider,
          operation: apiUsage.operation,
          model: apiUsage.model,
          inputTokens: apiUsage.inputTokens,
          cachedInputTokens: apiUsage.cachedInputTokens,
          outputTokens: apiUsage.outputTokens,
          durationMs: apiUsage.durationMs,
          estimatedCost: apiUsage.estimatedCost,
          requestId: apiUsage.requestId,
          createdAt: apiUsage.createdAt,
        })
        .from(apiUsage)
        .where(eq(apiUsage.projectId, id))
        .orderBy(desc(apiUsage.createdAt)),
    ]);

    const storyboard = activeStoryboard[0] ?? null;
    const [sceneSummary] = storyboard
      ? await db
          .select({ count: count() })
          .from(scenes)
          .where(eq(scenes.storyboardId, storyboard.id))
      : [{ count: 0 }];

    return NextResponse.json({
      project,
      assets: assetSummary[0],
      storyboard: storyboard ? { ...storyboard, sceneCount: sceneSummary.count } : null,
      generations: generationRows.map(({ outputObjectKey, ...generation }) => ({
        ...generation,
        outputStored: Boolean(outputObjectKey),
      })),
      jobs: jobRows.map(({ providerTaskId, ...job }) => ({
        ...job,
        providerTaskRecorded: Boolean(providerTaskId),
      })),
      usage: usageRows.map(({ requestId, ...usage }) => ({
        ...usage,
        requestIdRecorded: Boolean(requestId),
      })),
    });
  } catch (error) {
    return apiError(error, "監査情報を取得できませんでした");
  }
}
