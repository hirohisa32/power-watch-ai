import "server-only";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  assets,
  openingMasters,
  openingPreviewJobs,
  openingPreviews,
  projects,
} from "@/lib/db/schema";
import { OPENING_MASTER_KEY, OPENING_MASTER_VERSION } from "./prompts";
import { OPENING_MASTER_METADATA } from "./template";

export async function createOpeningPreview(input: { projectId: string; userId: string }) {
  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, input.projectId), eq(projects.userId, input.userId)))
    .limit(1);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  if (project.style !== "cinematic_real") throw new Error("OPENING_REQUIRES_REAL_MODE");

  const [active] = await db
    .select()
    .from(openingPreviews)
    .where(
      and(
        eq(openingPreviews.projectId, input.projectId),
        inArray(openingPreviews.status, ["queued", "generating", "rendering"]),
      ),
    )
    .limit(1);
  if (active) throw new Error("OPENING_PREVIEW_ALREADY_ACTIVE");

  const [retryable] = await db
    .select({ preview: openingPreviews, job: openingPreviewJobs })
    .from(openingPreviews)
    .innerJoin(openingPreviewJobs, eq(openingPreviewJobs.previewId, openingPreviews.id))
    .where(
      and(
        eq(openingPreviews.projectId, input.projectId),
        eq(openingPreviews.status, "failed"),
        isNotNull(openingPreviews.watchObjectKey),
      ),
    )
    .orderBy(desc(openingPreviews.createdAt))
    .limit(1);
  if (retryable) {
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(openingPreviews)
        .set({ status: "queued", stage: "watch-replace", errorCode: null, errorMessage: null, completedAt: null, updatedAt: now })
        .where(eq(openingPreviews.id, retryable.preview.id));
      await tx
        .update(openingPreviewJobs)
        .set({ status: "queued", errorCode: null, errorMessage: null, completedAt: null, updatedAt: now })
        .where(eq(openingPreviewJobs.id, retryable.job.id));
    });
    return { preview: retryable.preview, job: retryable.job };
  }

  const projectAssets = await db
    .select()
    .from(assets)
    .where(eq(assets.projectId, input.projectId))
    .orderBy(desc(assets.createdAt));
  const watch =
    projectAssets.find((asset) => /front hero|full front|正面|文字盤/i.test(asset.label)) ??
    projectAssets[0];
  if (!watch) throw new Error("WATCH_ASSET_REQUIRED");

  let [master] = await db
    .select()
    .from(openingMasters)
    .where(
      and(
        eq(openingMasters.key, OPENING_MASTER_KEY),
        eq(openingMasters.version, OPENING_MASTER_VERSION),
      ),
    )
    .limit(1);
  if (!master) {
    [master] = await db
      .insert(openingMasters)
      .values({
        key: OPENING_MASTER_KEY,
        version: OPENING_MASTER_VERSION,
        status: "completed",
        durationMs: Math.round(OPENING_MASTER_METADATA.totalDurationSeconds * 1000),
        segmentObjectKeys: ["system://opening-master/video.mp4"],
        providerTaskIds: [],
        actualCostCredits: 0,
        actualCostUsd: 0,
        completedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (!master)
      [master] = await db
        .select()
        .from(openingMasters)
        .where(
          and(
            eq(openingMasters.key, OPENING_MASTER_KEY),
            eq(openingMasters.version, OPENING_MASTER_VERSION),
          ),
        )
        .limit(1);
  }
  const [preview] = await db
    .insert(openingPreviews)
    .values({
      projectId: input.projectId,
      openingMasterId: master.id,
      watchAssetId: watch.id,
      stage: "watch-replace",
      durationMs: Math.round(OPENING_MASTER_METADATA.totalDurationSeconds * 1000),
    })
    .returning();
  const [job] = await db
    .insert(openingPreviewJobs)
    .values({ previewId: preview.id })
    .returning();
  return { preview, job };
}

export async function listOpeningPreviews(projectId: string) {
  return getDb()
    .select({ preview: openingPreviews, master: openingMasters, asset: assets })
    .from(openingPreviews)
    .innerJoin(openingMasters, eq(openingMasters.id, openingPreviews.openingMasterId))
    .innerJoin(assets, eq(assets.id, openingPreviews.watchAssetId))
    .where(eq(openingPreviews.projectId, projectId))
    .orderBy(desc(openingPreviews.createdAt));
}

export async function markOpeningEnqueueFailed(jobId: string, message: string) {
  const db = getDb();
  const [job] = await db
    .update(openingPreviewJobs)
    .set({ status: "failed", errorCode: "QUEUE_FAILED", errorMessage: message, updatedAt: new Date() })
    .where(eq(openingPreviewJobs.id, jobId))
    .returning();
  if (job)
    await db
      .update(openingPreviews)
      .set({ status: "failed", errorCode: "QUEUE_FAILED", errorMessage: message, updatedAt: new Date() })
      .where(eq(openingPreviews.id, job.previewId));
}
