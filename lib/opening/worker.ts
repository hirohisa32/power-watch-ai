import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { narrationConfig } from "@/lib/audio/config";
import { ElevenLabsNarrationProvider } from "@/lib/audio/elevenlabs";
import { getDb } from "@/lib/db";
import {
  apiUsage,
  assets,
  openingMasters,
  openingPreviewJobs,
  openingPreviews,
  projects,
} from "@/lib/db/schema";
import { createReadUrl, uploadPrivateObject } from "@/lib/storage";
import { creditsToUsd } from "@/lib/video/cost";
import { videoConfig } from "@/lib/video/config";
import { downloadValidatedMp4 } from "@/lib/video/download";
import { RunwayVideoProvider } from "@/lib/video/runway";
import { inspectOpeningAudio, renderOpeningPreview } from "./ffmpeg";
import {
  OPENING_MASTER_PROMPTS,
  OPENING_NARRATION,
  masterSegmentObjectKey,
  openingNarrationObjectKey,
  openingPreviewObjectKey,
  openingWatchObjectKey,
  watchRevealPrompt,
} from "./prompts";
import { VercelOpeningPreviewJobQueue, type OpeningPreviewJobQueue } from "./queue";

const POLL_SECONDS = 8;

export async function processOpeningPreviewJob(
  jobId: string,
  cycle: number,
  deps = {
    video: new RunwayVideoProvider(),
    narration: new ElevenLabsNarrationProvider(),
    queue: new VercelOpeningPreviewJobQueue() as OpeningPreviewJobQueue,
  },
) {
  const db = getDb();
  const row = await load(jobId);
  if (!row || ["completed", "failed"].includes(row.job.status)) return;
  try {
    if (row.job.status === "queued") {
      const now = new Date();
      await db.transaction(async (tx) => {
        await tx
          .update(openingPreviewJobs)
          .set({ status: "generating", attempts: row.job.attempts + 1, updatedAt: now })
          .where(eq(openingPreviewJobs.id, jobId));
        await tx
          .update(openingPreviews)
          .set({ status: "generating", errorCode: null, errorMessage: null, updatedAt: now })
          .where(eq(openingPreviews.id, row.preview.id));
      });
    }

    if (row.master.status !== "completed") {
      await processMaster(row, jobId, cycle, deps.video, deps.queue);
      return;
    }

    if (!row.preview.watchObjectKey) {
      await processWatch(row, jobId, cycle, deps.video, deps.queue);
      return;
    }

    await render(row, jobId, deps.narration);
  } catch (error) {
    await fail(jobId, row.preview.id, error);
    throw error;
  }
}

async function processMaster(
  row: Awaited<ReturnType<typeof load>> & {},
  jobId: string,
  cycle: number,
  provider: RunwayVideoProvider,
  queue: OpeningPreviewJobQueue,
) {
  const db = getDb();
  const keys = row.master.segmentObjectKeys;
  const taskIds = row.master.providerTaskIds;
  const index = keys.length;
  if (index >= OPENING_MASTER_PROMPTS.length) {
    await db
      .update(openingMasters)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(openingMasters.id, row.master.id));
    await queue.enqueue({ jobId, cycle: cycle + 1 });
    return;
  }
  if (taskIds.length === keys.length) {
    const started = Date.now();
    const task = await provider.generate({
      model: videoConfig().cinematicModel,
      prompt: OPENING_MASTER_PROMPTS[index],
      duration: 5,
      ratio: "720:1280",
    });
    await db.transaction(async (tx) => {
      await tx
        .update(openingMasters)
        .set({ status: "generating", providerTaskIds: [...taskIds, task.taskId], updatedAt: new Date() })
        .where(eq(openingMasters.id, row.master.id));
      await tx.insert(apiUsage).values({
        projectId: row.preview.projectId,
        provider: "runway",
        operation: `opening_master_segment_${index + 1}_submit`,
        model: videoConfig().cinematicModel,
        requestId: task.taskId,
        durationMs: Date.now() - started,
        estimatedCost: creditsToUsd(task.estimatedCostCredits, videoConfig().creditCostUsd),
      });
    });
    await queue.enqueue({ jobId, cycle: cycle + 1 }, POLL_SECONDS);
    return;
  }
  const taskId = taskIds[index];
  const status = await provider.getStatus(taskId);
  if (status.status === "pending" || status.status === "running") {
    await queue.enqueue({ jobId, cycle: cycle + 1 }, POLL_SECONDS);
    return;
  }
  if (status.status !== "succeeded") throw new Error(status.message || "OPENING_MASTER_FAILED");
  const bytes = await downloadValidatedMp4(status.outputUrl, {
    timeoutMs: videoConfig().downloadTimeoutMs,
    maxBytes: videoConfig().downloadMaxBytes,
  });
  const objectKey = masterSegmentObjectKey(index);
  await uploadPrivateObject(objectKey, bytes, "video/mp4");
  const credits = status.actualCostCredits ?? 0;
  const usd = creditsToUsd(credits, videoConfig().creditCostUsd) ?? 0;
  await db.transaction(async (tx) => {
    await tx
      .update(openingMasters)
      .set({
        segmentObjectKeys: [...keys, objectKey],
        actualCostCredits: row.master.actualCostCredits + credits,
        actualCostUsd: row.master.actualCostUsd + usd,
        updatedAt: new Date(),
      })
      .where(eq(openingMasters.id, row.master.id));
    await tx.insert(apiUsage).values({
      projectId: row.preview.projectId,
      provider: "runway",
      operation: `opening_master_segment_${index + 1}_complete`,
      model: videoConfig().cinematicModel,
      requestId: taskId,
      durationMs: 0,
      estimatedCost: usd,
    });
  });
  await queue.enqueue({ jobId, cycle: cycle + 1 });
}

async function processWatch(
  row: Awaited<ReturnType<typeof load>> & {},
  jobId: string,
  cycle: number,
  provider: RunwayVideoProvider,
  queue: OpeningPreviewJobQueue,
) {
  const db = getDb();
  if (!row.preview.watchTaskId) {
    const referenceImageUrl = await createReadUrl(row.asset.objectKey, 60 * 60);
    const started = Date.now();
    const task = await provider.generate({
      model: videoConfig().cinematicModel,
      prompt: watchRevealPrompt(),
      duration: 5,
      ratio: "720:1280",
      referenceImageUrl,
    });
    await db.transaction(async (tx) => {
      await tx
        .update(openingPreviews)
        .set({ stage: "watch", watchTaskId: task.taskId, updatedAt: new Date() })
        .where(eq(openingPreviews.id, row.preview.id));
      await tx.insert(apiUsage).values({
        projectId: row.preview.projectId,
        provider: "runway",
        operation: "opening_watch_reveal_submit",
        model: videoConfig().cinematicModel,
        requestId: task.taskId,
        durationMs: Date.now() - started,
        estimatedCost: creditsToUsd(task.estimatedCostCredits, videoConfig().creditCostUsd),
      });
    });
    await queue.enqueue({ jobId, cycle: cycle + 1 }, POLL_SECONDS);
    return;
  }
  const status = await provider.getStatus(row.preview.watchTaskId);
  if (status.status === "pending" || status.status === "running") {
    await queue.enqueue({ jobId, cycle: cycle + 1 }, POLL_SECONDS);
    return;
  }
  if (status.status !== "succeeded") throw new Error(status.message || "WATCH_REVEAL_FAILED");
  const bytes = await downloadValidatedMp4(status.outputUrl, {
    timeoutMs: videoConfig().downloadTimeoutMs,
    maxBytes: videoConfig().downloadMaxBytes,
  });
  const objectKey = openingWatchObjectKey(row.preview.projectId, row.preview.id);
  await uploadPrivateObject(objectKey, bytes, "video/mp4");
  const credits = status.actualCostCredits ?? 0;
  const usd = creditsToUsd(credits, videoConfig().creditCostUsd) ?? 0;
  await db.transaction(async (tx) => {
    await tx
      .update(openingPreviews)
      .set({ watchObjectKey: objectKey, runwayCredits: credits, runwayCostUsd: usd, updatedAt: new Date() })
      .where(eq(openingPreviews.id, row.preview.id));
    await tx.insert(apiUsage).values({
      projectId: row.preview.projectId,
      provider: "runway",
      operation: "opening_watch_reveal_complete",
      model: videoConfig().cinematicModel,
      requestId: row.preview.watchTaskId,
      durationMs: 0,
      estimatedCost: usd,
    });
  });
  await queue.enqueue({ jobId, cycle: cycle + 1 });
}

async function render(
  row: Awaited<ReturnType<typeof load>> & {},
  jobId: string,
  narration: ElevenLabsNarrationProvider,
) {
  const db = getDb();
  await db
    .update(openingPreviews)
    .set({ status: "rendering", stage: "audio-and-render", updatedAt: new Date() })
    .where(eq(openingPreviews.id, row.preview.id));
  const work = await mkdtemp(path.join(tmpdir(), "power-watch-opening-"));
  try {
    const segmentPaths = await Promise.all(
      [...row.master.segmentObjectKeys, row.preview.watchObjectKey!].map(async (key, index) => {
        const file = path.join(work, `segment-${index}.mp4`);
        await writeFile(file, await download(await createReadUrl(key, 900)));
        return file;
      }),
    );
    const config = narrationConfig();
    const voiceId = row.project.narratorVoiceId || config.defaultVoiceId;
    const narrationStarted = Date.now();
    const generated = await narration.generate({ text: OPENING_NARRATION, speed: 0.94, voiceId });
    const narrationKey = openingNarrationObjectKey(row.preview.projectId, row.preview.id);
    await uploadPrivateObject(narrationKey, generated.bytes, generated.contentType);
    const narrationPath = path.join(work, "narration.mp3");
    await writeFile(narrationPath, generated.bytes);
    const elevenCost = (generated.characterCost / 1000) * config.pricePerThousandCharacters;
    await db.insert(apiUsage).values({
      projectId: row.preview.projectId,
      provider: "elevenlabs",
      operation: "opening_narration",
      model: config.model,
      requestId: generated.requestId,
      units: generated.characterCost,
      durationMs: Date.now() - narrationStarted,
      estimatedCost: elevenCost,
    });
    const output = path.join(work, "opening-preview.mp4");
    await renderOpeningPreview(
      { videos: segmentPaths as [string, string, string, string], narration: narrationPath, output },
      path.join(process.cwd(), ".vercel-build-assets", "fonts"),
    );
    const audioMetrics = await inspectOpeningAudio(output);
    if (!audioMetrics.audioStreamPresent || audioMetrics.meanVolumeDb == null)
      throw new Error("OPENING_AUDIO_VALIDATION_FAILED");
    const outputKey = openingPreviewObjectKey(row.preview.projectId, row.preview.id);
    await uploadPrivateObject(outputKey, new Uint8Array(await readFile(output)), "video/mp4");
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(openingPreviews)
        .set({
          status: "completed",
          stage: "completed",
          narrationObjectKey: narrationKey,
          outputObjectKey: outputKey,
          runwayCredits: row.master.actualCostCredits + row.preview.runwayCredits,
          runwayCostUsd: row.master.actualCostUsd + row.preview.runwayCostUsd,
          elevenlabsCostUsd: elevenCost,
          audioMetrics,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(openingPreviews.id, row.preview.id));
      await tx
        .update(openingPreviewJobs)
        .set({ status: "completed", completedAt: now, updatedAt: now })
        .where(eq(openingPreviewJobs.id, jobId));
    });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function load(jobId: string) {
  const [row] = await getDb()
    .select({
      job: openingPreviewJobs,
      preview: openingPreviews,
      master: openingMasters,
      asset: assets,
      project: projects,
    })
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
  const code = /credit/i.test(message) ? "INSUFFICIENT_CREDITS" : "OPENING_PREVIEW_FAILED";
  const db = getDb();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(openingPreviewJobs)
      .set({ status: "failed", errorCode: code, errorMessage: message, completedAt: now, updatedAt: now })
      .where(eq(openingPreviewJobs.id, jobId));
    await tx
      .update(openingPreviews)
      .set({ status: "failed", errorCode: code, errorMessage: message, completedAt: now, updatedAt: now })
      .where(eq(openingPreviews.id, previewId));
  });
}
