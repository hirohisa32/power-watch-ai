import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assets, openingMasters, openingPreviewJobs, openingPreviews, projects } from "@/lib/db/schema";
import { createReadUrl, uploadPrivateObject } from "@/lib/storage";
import { createNormalizedWatchCutout } from "./cutout";
import { inspectOpeningAudio, renderOpeningPreview, type WatchCutout } from "./ffmpeg";
import { chooseWatchRole } from "./motion";
import { openingMasterSystemPath, openingPreviewObjectKey, openingWatchObjectKey } from "./template";

export async function processOpeningPreviewJob(jobId: string, cycle: number) {
  void cycle;
  const db = getDb();
  const row = await load(jobId);
  if (!row || ["completed", "failed"].includes(row.job.status)) return;
  try {
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(openingPreviewJobs).set({ status: "rendering", attempts: row.job.attempts + 1, updatedAt: now }).where(eq(openingPreviewJobs.id, jobId));
      await tx.update(openingPreviews).set({ status: "rendering", stage: "watch-replace", errorCode: null, errorMessage: null, updatedAt: now }).where(eq(openingPreviews.id, row.preview.id));
    });
    await render(row, jobId);
  } catch (error) {
    await fail(jobId, row.preview.id, error);
    throw error;
  }
}

async function render(row: Awaited<ReturnType<typeof load>> & {}, jobId: string) {
  const db = getDb();
  const work = await mkdtemp(path.join(tmpdir(), "power-watch-opening-"));
  try {
    const projectAssets = await db.select().from(assets).where(eq(assets.projectId, row.preview.projectId));
    const imageAssets = projectAssets.filter((asset) => asset.mimeType.startsWith("image/"));
    const watchCutouts: WatchCutout[] = [];
    for (const [index, asset] of imageAssets.entries()) {
      const role = chooseWatchRole(`${asset.label} ${asset.objectKey}`, index);
      if (!role || watchCutouts.some((item) => item.role === role)) continue;
      const source = await download(await createReadUrl(asset.objectKey, 900));
      const cutout = await createNormalizedWatchCutout(source);
      const localPath = path.join(work, `${role}-watch-cutout.png`);
      await writeFile(localPath, cutout);
      watchCutouts.push({ path: localPath, role });
    }
    if (!watchCutouts.length) throw new Error("WATCH_ASSET_REQUIRED");
    const primary = watchCutouts.find((item) => item.role === "front") ?? watchCutouts[0];
    const watchObjectKey = openingWatchObjectKey(row.preview.projectId, row.preview.id);
    await uploadPrivateObject(watchObjectKey, new Uint8Array(await readFile(primary.path)), "image/png");

    const output = path.join(work, "opening-preview.mp4");
    await renderOpeningPreview({
      watchlessMaster: openingMasterSystemPath("watchless-master.mp4"),
      watchCutouts,
      audioMaster: openingMasterSystemPath("audio-master-v3.wav"),
      output,
    });
    const audioMetrics = await inspectOpeningAudio(output);
    if (!audioMetrics.audioStreamPresent || audioMetrics.meanVolumeDb == null)
      throw new Error("OPENING_AUDIO_VALIDATION_FAILED");
    const outputKey = openingPreviewObjectKey(row.preview.projectId, row.preview.id);
    await uploadPrivateObject(outputKey, new Uint8Array(await readFile(output)), "video/mp4");
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(openingPreviews).set({
        status: "completed",
        stage: "completed",
        durationMs: 15041,
        watchTaskId: null,
        watchObjectKey,
        narrationObjectKey: null,
        outputObjectKey: outputKey,
        runwayCredits: 0,
        runwayCostUsd: 0,
        elevenlabsCostUsd: 0,
        audioMetrics,
        completedAt: now,
        updatedAt: now,
      }).where(eq(openingPreviews.id, row.preview.id));
      await tx.update(openingPreviewJobs).set({ status: "completed", completedAt: now, updatedAt: now }).where(eq(openingPreviewJobs.id, jobId));
    });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function load(jobId: string) {
  const [row] = await getDb()
    .select({ job: openingPreviewJobs, preview: openingPreviews, master: openingMasters, asset: assets, project: projects })
    .from(openingPreviewJobs)
    .innerJoin(openingPreviews, eq(openingPreviews.id, openingPreviewJobs.previewId))
    .innerJoin(openingMasters, eq(openingMasters.id, openingPreviews.openingMasterId))
    .innerJoin(assets, eq(assets.id, openingPreviews.watchAssetId))
    .innerJoin(projects, eq(projects.id, openingPreviews.projectId))
    .where(eq(openingPreviewJobs.id, jobId))
    .limit(1);
  return row;
}

async function download(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`OPENING_MEDIA_DOWNLOAD_${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function fail(jobId: string, previewId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Opening Previewの作成に失敗しました";
  const db = getDb();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(openingPreviewJobs).set({ status: "failed", errorCode: "OPENING_PREVIEW_FAILED", errorMessage: message, completedAt: now, updatedAt: now }).where(eq(openingPreviewJobs.id, jobId));
    await tx.update(openingPreviews).set({ status: "failed", errorCode: "OPENING_PREVIEW_FAILED", errorMessage: message, completedAt: now, updatedAt: now }).where(eq(openingPreviews.id, previewId));
  });
}
