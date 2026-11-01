import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, count, desc, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { apiUsage, assets, imageGenerationAudits, projects, scenes, videoGenerations, videoJobs } from "@/lib/db/schema";
import { createReadUrl, readPrivateObject, uploadPrivateObject } from "@/lib/storage";
import { estimateOpenAiImageCost } from "@/lib/image/cost";
import { OpenAIImageGenerationProvider } from "@/lib/image/openai";
import { buildAnimationKeyframePrompt, buildCharacterReferencePrompt, characterKeyForScene, type CHARACTER_BIBLES } from "@/lib/image/prompt";
import { inspectKeyframe } from "@/lib/image/quality";
import type { ImageGenerationProvider, ImagePurpose, ImageReference } from "@/lib/image/types";
import { creditsToUsd } from "./cost";
import { videoConfig } from "./config";
import { downloadValidatedMp4 } from "./download";
import { generationObjectKey } from "./orchestration";
import { VercelVideoJobQueue, type VideoJobQueue } from "./queue";
import { RunwayVideoProvider } from "./runway";
import { VideoProviderError, type VideoProvider } from "./types";
import {
  PRODUCT_EVIDENCE_PROVIDER,
  renderProductPhotoMotion,
} from "./product-photo";

type WorkerDependencies = {
  provider: VideoProvider;
  queue: VideoJobQueue;
  download: typeof downloadValidatedMp4;
  upload: typeof uploadPrivateObject;
  signAsset: typeof createReadUrl;
  renderProductPhoto?: typeof renderProductPhotoMotion;
  imageProvider?: ImageGenerationProvider;
};

const defaults = (): WorkerDependencies => ({
  provider: new RunwayVideoProvider(),
  queue: new VercelVideoJobQueue(),
  download: downloadValidatedMp4,
  upload: uploadPrivateObject,
  signAsset: createReadUrl,
  renderProductPhoto: renderProductPhotoMotion,
  imageProvider: new OpenAIImageGenerationProvider(),
});

export async function processVideoJob(
  jobId: string,
  cycle: number,
  dependencies: WorkerDependencies = defaults(),
) {
  const db = getDb();
  const row = await loadJob(jobId);
  if (!row || ["completed", "failed", "canceled"].includes(row.job.status)) return;
  const config = videoConfig();

  if (row.generation.provider === PRODUCT_EVIDENCE_PROVIDER) {
    await processProductEvidence(row, dependencies);
    return;
  }

  if (!row.job.providerTaskId) {
    if (row.job.attempts >= config.maxRetries) {
      await failJob(
        jobId,
        row.generation.id,
        "RETRY_LIMIT",
        "動画生成の最大再試行回数に達しました",
      );
      return;
    }
    const reserved = await reserveCapacity(jobId, config.concurrency, config.maxRetries);
    if (!reserved) {
      await dependencies.queue.enqueue({ jobId, cycle: cycle + 1 }, config.pollDelaySeconds);
      return;
    }
    try {
      const keyframeObjectKey = await ensureAnimationKeyframe(row, dependencies);
      const reference = !keyframeObjectKey && row.generation.referenceAssetIds[0]
        ? await db
            .select({ objectKey: assets.objectKey })
            .from(assets)
            .where(eq(assets.id, row.generation.referenceAssetIds[0]))
            .limit(1)
        : [];
      const referenceImageUrl = keyframeObjectKey
        ? await dependencies.signAsset(keyframeObjectKey, 60 * 60)
        : reference[0]
        ? await dependencies.signAsset(reference[0].objectKey, 60 * 60)
        : undefined;
      const started = Date.now();
      const task = await dependencies.provider.generate({
        model: row.generation.model,
        prompt: row.generation.prompt,
        duration: row.generation.requestedDuration,
        ratio: "720:1280",
        referenceImageUrl,
      });
      await db.transaction(async (transaction) => {
        await transaction
          .update(videoJobs)
          .set({ providerTaskId: task.taskId, updatedAt: new Date() })
          .where(eq(videoJobs.id, jobId));
        await transaction
          .update(videoGenerations)
          .set({
            status: "generating",
            pipelineStage: "video_generating",
            estimatedCostCredits: task.estimatedCostCredits ?? row.generation.estimatedCostCredits,
            estimatedCostUsd:
              creditsToUsd(task.estimatedCostCredits, config.creditCostUsd) ??
              row.generation.estimatedCostUsd,
            updatedAt: new Date(),
          })
          .where(eq(videoGenerations.id, row.generation.id));
        await transaction.insert(apiUsage).values({
          projectId: row.job.projectId,
          provider: dependencies.provider.name,
          operation: "video_generation_submit",
          model: row.generation.model,
          requestId: task.taskId,
          durationMs: Date.now() - started,
          estimatedCost: creditsToUsd(task.estimatedCostCredits, config.creditCostUsd),
        });
      });
      await dependencies.queue.enqueue({ jobId, cycle: cycle + 1 }, config.pollDelaySeconds);
      return;
    } catch (error) {
      await handleWorkerError(
        jobId,
        row.generation.id,
        error,
        reserved.attempts,
        config.maxRetries,
      );
      throw error;
    }
  }

  const status = await dependencies.provider.getStatus(row.job.providerTaskId);
  if (status.status === "pending" || status.status === "running") {
    await dependencies.queue.enqueue({ jobId, cycle: cycle + 1 }, config.pollDelaySeconds);
    return;
  }
  if (status.status === "failed" || status.status === "canceled") {
    if (status.retryable && row.job.attempts < config.maxRetries) {
      await db.transaction(async (transaction) => {
        await transaction
          .update(videoJobs)
          .set({
            status: "queued",
            providerTaskId: null,
            errorCode: status.code,
            errorMessage: status.message,
            updatedAt: new Date(),
          })
          .where(eq(videoJobs.id, jobId));
        await transaction
          .update(videoGenerations)
          .set({
            status: "queued",
            errorCode: status.code,
            errorMessage: status.message,
            updatedAt: new Date(),
          })
          .where(eq(videoGenerations.id, row.generation.id));
      });
      await dependencies.queue.enqueue({ jobId, cycle: cycle + 1 }, config.pollDelaySeconds * 2);
      return;
    }
    await failJob(
      jobId,
      row.generation.id,
      status.code || status.status.toUpperCase(),
      status.message,
    );
    return;
  }

  await db.update(videoGenerations).set({ pipelineStage: "saving", updatedAt: new Date() }).where(eq(videoGenerations.id, row.generation.id));
  const bytes = await dependencies.download(status.outputUrl, {
    timeoutMs: config.downloadTimeoutMs,
    maxBytes: config.downloadMaxBytes,
  });
  const outputKey = generationObjectKey(row.job.projectId, row.job.sceneId, row.generation.id);
  await dependencies.upload(outputKey, bytes, "video/mp4");
  const actualUsd = creditsToUsd(status.actualCostCredits, config.creditCostUsd);
  await db.transaction(async (transaction) => {
    const now = new Date();
    await transaction
      .update(videoGenerations)
      .set({
        status: "completed",
        pipelineStage: "completed",
        outputObjectKey: outputKey,
        actualCostCredits: status.actualCostCredits,
        actualCostUsd: actualUsd,
        errorCode: null,
        errorMessage: null,
        updatedAt: now,
        completedAt: now,
      })
      .where(eq(videoGenerations.id, row.generation.id));
    await transaction
      .update(videoJobs)
      .set({
        status: "completed",
        errorCode: null,
        errorMessage: null,
        updatedAt: now,
        completedAt: now,
      })
      .where(eq(videoJobs.id, jobId));
    await transaction
      .update(scenes)
      .set({ selectedGenerationId: row.generation.id, updatedAt: now })
      .where(eq(scenes.id, row.job.sceneId));
    await transaction.insert(apiUsage).values({
      projectId: row.job.projectId,
      provider: dependencies.provider.name,
      operation: "video_generation_complete",
      model: row.generation.model,
      requestId: row.job.providerTaskId,
      durationMs: Date.now() - row.job.createdAt.getTime(),
      estimatedCost: actualUsd,
    });
  });
  await refreshProjectStatus(row.job.projectId);
}

async function processProductEvidence(
  row: NonNullable<Awaited<ReturnType<typeof loadJob>>>,
  dependencies: WorkerDependencies,
) {
  const db = getDb();
  const jobId = row.job.id;
  const generationId = row.generation.id;
  const assetId = row.generation.referenceAssetIds[0];
  if (!assetId) {
    await failJob(jobId, generationId, "PRODUCT_PHOTO_REQUIRED", "元の時計写真が見つかりません");
    return;
  }
  const [asset] = await db
    .select({ objectKey: assets.objectKey, mimeType: assets.mimeType })
    .from(assets)
    .where(eq(assets.id, assetId))
    .limit(1);
  if (!asset) {
    await failJob(jobId, generationId, "PRODUCT_PHOTO_REQUIRED", "元の時計写真が見つかりません");
    return;
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "power-watch-product-evidence-"));
  try {
    await db.transaction(async (transaction) => {
      const now = new Date();
      await transaction
        .update(videoJobs)
        .set({ status: "processing", attempts: row.job.attempts + 1, startedAt: row.job.startedAt ?? now, updatedAt: now })
        .where(eq(videoJobs.id, jobId));
      await transaction
        .update(videoGenerations)
        .set({ status: "generating", pipelineStage: "video_preparing", updatedAt: now })
        .where(eq(videoGenerations.id, generationId));
    });
    const signed = await dependencies.signAsset(asset.objectKey, 15 * 60);
    const response = await fetch(signed, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`PRODUCT_PHOTO_HTTP_${response.status}`);
    const extension = asset.mimeType === "image/png" ? ".png" : asset.mimeType === "image/webp" ? ".webp" : ".jpg";
    const inputPath = path.join(workDir, `original-product${extension}`);
    const outputPath = path.join(workDir, "product-evidence.mp4");
    await writeFile(inputPath, new Uint8Array(await response.arrayBuffer()));
    await (dependencies.renderProductPhoto ?? renderProductPhotoMotion)(
      inputPath,
      outputPath,
      row.generation.requestedDuration,
    );
    const bytes = new Uint8Array(await readFile(outputPath));
    const outputKey = generationObjectKey(row.job.projectId, row.job.sceneId, generationId);
    await dependencies.upload(outputKey, bytes, "video/mp4");
    const now = new Date();
    await db.transaction(async (transaction) => {
      await transaction
        .update(videoGenerations)
        .set({ status: "completed", pipelineStage: "completed", outputObjectKey: outputKey, actualCostCredits: 0, actualCostUsd: 0, errorCode: null, errorMessage: null, updatedAt: now, completedAt: now })
        .where(eq(videoGenerations.id, generationId));
      await transaction
        .update(videoJobs)
        .set({ status: "completed", errorCode: null, errorMessage: null, updatedAt: now, completedAt: now })
        .where(eq(videoJobs.id, jobId));
      await transaction
        .update(scenes)
        .set({ selectedGenerationId: generationId, updatedAt: now })
        .where(eq(scenes.id, row.job.sceneId));
      await transaction.insert(apiUsage).values({
        projectId: row.job.projectId,
        provider: PRODUCT_EVIDENCE_PROVIDER,
        operation: "original_product_photo_motion",
        model: row.generation.model,
        units: Math.round(row.generation.requestedDuration * 30),
        durationMs: now.getTime() - row.job.createdAt.getTime(),
        estimatedCost: 0,
      });
    });
    await refreshProjectStatus(row.job.projectId);
  } catch (error) {
    await failJob(
      jobId,
      generationId,
      "PRODUCT_PHOTO_MOTION_FAILED",
      error instanceof Error ? error.message : "商品写真の映像化に失敗しました",
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function markQueueDeliveryExhausted(jobId: string, message: string) {
  const row = await loadJob(jobId);
  if (row && !["completed", "failed", "canceled"].includes(row.job.status)) {
    await failJob(jobId, row.generation.id, "QUEUE_RETRY_LIMIT", message);
  }
}

async function loadJob(jobId: string) {
  const [row] = await getDb()
    .select({ job: videoJobs, generation: videoGenerations })
    .from(videoJobs)
    .innerJoin(videoGenerations, eq(videoGenerations.id, videoJobs.generationId))
    .where(eq(videoJobs.id, jobId))
    .limit(1);
  return row;
}

async function reserveCapacity(jobId: string, concurrency: number, maxRetries: number) {
  return getDb().transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext('video-generation-capacity'))`,
    );
    const [job] = await transaction
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.id, jobId))
      .limit(1);
    if (!job || job.status !== "queued" || job.attempts >= maxRetries) return null;
    const [active] = await transaction
      .select({ value: count() })
      .from(videoJobs)
      .where(and(eq(videoJobs.status, "processing"), ne(videoJobs.id, jobId)));
    if (active.value >= concurrency) return null;
    const [reserved] = await transaction
      .update(videoJobs)
      .set({
        status: "processing",
        attempts: job.attempts + 1,
        startedAt: job.startedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(videoJobs.id, jobId), eq(videoJobs.status, "queued")))
      .returning({ attempts: videoJobs.attempts });
    return reserved ?? null;
  });
}

async function handleWorkerError(
  jobId: string,
  generationId: string,
  error: unknown,
  attempts: number,
  maxRetries: number,
) {
  const providerError = error instanceof VideoProviderError ? error : null;
  const message = error instanceof Error ? error.message : "Video worker failed";
  if (providerError?.retryable && attempts < maxRetries) {
    const db = getDb();
    await db
      .update(videoJobs)
      .set({
        status: "queued",
        errorCode: providerError.code,
        errorMessage: message,
        updatedAt: new Date(),
      })
      .where(eq(videoJobs.id, jobId));
    await db
      .update(videoGenerations)
      .set({
        status: "queued",
        errorCode: providerError.code,
        errorMessage: message,
        updatedAt: new Date(),
      })
      .where(eq(videoGenerations.id, generationId));
    return;
  }
  await failJob(jobId, generationId, providerError?.code || "WORKER_ERROR", message);
}

export async function failJob(jobId: string, generationId: string, code: string, message: string) {
  const db = getDb();
  const now = new Date();
  await db.transaction(async (transaction) => {
    await transaction
      .update(videoJobs)
      .set({
        status: "failed",
        errorCode: code,
        errorMessage: message,
        updatedAt: now,
        completedAt: now,
      })
      .where(eq(videoJobs.id, jobId));
    await transaction
      .update(videoGenerations)
      .set({
        status: "failed",
        pipelineStage: "error",
        errorCode: code,
        errorMessage: message,
        updatedAt: now,
        completedAt: now,
      })
      .where(eq(videoGenerations.id, generationId));
  });
}

async function ensureAnimationKeyframe(
  row: NonNullable<Awaited<ReturnType<typeof loadJob>>>,
  dependencies: WorkerDependencies,
) {
  const db = getDb();
  const [context] = await db
    .select({ project: projects, scene: scenes })
    .from(scenes)
    .innerJoin(projects, eq(projects.id, scenes.projectId))
    .where(eq(scenes.id, row.job.sceneId))
    .limit(1);
  if (!context || context.project.style !== "animation" || context.scene.watchReference) return null;
  if (row.generation.keyframeImageId) {
    const [existing] = await db.select().from(imageGenerationAudits).where(and(eq(imageGenerationAudits.id, row.generation.keyframeImageId), eq(imageGenerationAudits.status, "completed"))).limit(1);
    if (existing?.outputObjectKey) return existing.outputObjectKey;
  }
  const provider = dependencies.imageProvider ?? new OpenAIImageGenerationProvider();
  await db.update(videoGenerations).set({ pipelineStage: "image_creating", updatedAt: new Date() }).where(eq(videoGenerations.id, row.generation.id));
  const characterKey = characterKeyForScene(context.scene);
  const references: ImageReference[] = [];
  const referenceObjectKeys: string[] = [];
  if (characterKey) {
    let [character] = await db
      .select()
      .from(imageGenerationAudits)
      .where(and(eq(imageGenerationAudits.projectId, row.job.projectId), eq(imageGenerationAudits.purpose, "character_reference"), eq(imageGenerationAudits.characterKey, characterKey), eq(imageGenerationAudits.status, "completed")))
      .orderBy(desc(imageGenerationAudits.generatedAt))
      .limit(1);
    if (!character?.outputObjectKey) {
      character = await generateAuditedImage({
        row,
        provider,
        purpose: "character_reference",
        prompt: buildCharacterReferencePrompt(characterKey),
        characterKey,
        references: [],
      });
    }
    if (character.outputObjectKey) {
      const bytes = await readPrivateObject(character.outputObjectKey);
      references.push({ bytes, mimeType: "image/jpeg", name: `${characterKey}.jpg` });
      referenceObjectKeys.push(character.outputObjectKey);
    }
  }
  const purpose = keyframePurpose(context.scene.preset);
  const keyframe = await generateAuditedImage({
    row,
    provider,
    purpose,
    prompt: buildAnimationKeyframePrompt(context.scene, characterKey),
    characterKey,
    references,
    referenceObjectKeys,
  });
  if (!keyframe.outputObjectKey) throw new Error("Scene Keyframeが保存されませんでした");
  await db.update(videoGenerations).set({ keyframeImageId: keyframe.id, pipelineStage: "video_preparing", updatedAt: new Date() }).where(eq(videoGenerations.id, row.generation.id));
  return keyframe.outputObjectKey;
}

async function generateAuditedImage(input: {
  row: NonNullable<Awaited<ReturnType<typeof loadJob>>>;
  provider: ImageGenerationProvider;
  purpose: ImagePurpose;
  prompt: string;
  characterKey: keyof typeof CHARACTER_BIBLES | null;
  references: ImageReference[];
  referenceObjectKeys?: string[];
}) {
  const db = getDb();
  const [audit] = await db.insert(imageGenerationAudits).values({
    projectId: input.row.job.projectId,
    videoId: input.row.generation.id,
    sceneId: input.row.job.sceneId,
    provider: input.provider.name,
    model: input.provider.model,
    purpose: input.purpose,
    prompt: input.prompt,
    characterKey: input.characterKey,
    referenceObjectKeys: input.referenceObjectKeys ?? [],
  }).returning();
  try {
    const startedAt = Date.now();
    const result = await input.provider.generate({ prompt: input.prompt, purpose: input.purpose, references: input.references });
    const costUsd = estimateOpenAiImageCost(result);
    await db.transaction(async (transaction) => {
      await transaction.update(imageGenerationAudits).set({ status: "quality_gate", imageInputTokens: result.imageInputTokens, imageOutputTokens: result.imageOutputTokens, textInputTokens: result.textInputTokens, costUsd, requestId: result.requestId, generatedAt: new Date(), updatedAt: new Date() }).where(eq(imageGenerationAudits.id, audit.id));
      await transaction.insert(apiUsage).values({ projectId: input.row.job.projectId, provider: "openai-image", operation: `image_generation:${input.purpose}`, model: result.model, inputTokens: result.textInputTokens + result.imageInputTokens, outputTokens: result.imageOutputTokens, units: result.imageOutputTokens, requestId: result.requestId, durationMs: Date.now() - startedAt, estimatedCost: costUsd });
    });
    await db.update(videoGenerations).set({ pipelineStage: "image_quality_gate", updatedAt: new Date() }).where(eq(videoGenerations.id, input.row.generation.id));
    const qualityGate = await inspectKeyframe(result.bytes);
    if (!qualityGate.pass) {
      await db.update(imageGenerationAudits).set({ status: "failed", qualityGate, errorCode: "QUALITY_GATE_FAILED", errorMessage: qualityGate.reasons.join(" / "), updatedAt: new Date() }).where(eq(imageGenerationAudits.id, audit.id));
      throw new Error(`画像Quality Gate不合格: ${qualityGate.reasons.join(" / ")}`);
    }
    const outputObjectKey = `projects/${input.row.job.projectId}/keyframes/${audit.id}.jpg`;
    await uploadPrivateObject(outputObjectKey, result.bytes, result.mimeType);
    const [completed] = await db.transaction(async (transaction) => {
      const [saved] = await transaction.update(imageGenerationAudits).set({ status: "completed", outputObjectKey, qualityGate, updatedAt: new Date() }).where(eq(imageGenerationAudits.id, audit.id)).returning();
      return [saved];
    });
    return completed;
  } catch (error) {
    await db.update(imageGenerationAudits).set({ status: "failed", errorCode: error instanceof Error && "code" in error ? String(error.code) : "IMAGE_GENERATION_FAILED", errorMessage: error instanceof Error ? error.message : "画像生成に失敗しました", updatedAt: new Date() }).where(and(eq(imageGenerationAudits.id, audit.id), ne(imageGenerationAudits.status, "completed"), ne(imageGenerationAudits.status, "failed")));
    throw error;
  }
}

function keyframePurpose(preset: string): ImagePurpose {
  if (/Historical|Vintage|OldBook/.test(preset)) return "historical_scene";
  if (/City|YearLocation/.test(preset)) return "environment";
  return "scene_keyframe";
}

async function refreshProjectStatus(projectId: string) {
  const db = getDb();
  const [remaining] = await db
    .select({ value: count() })
    .from(scenes)
    .where(and(eq(scenes.projectId, projectId), sql`${scenes.selectedGenerationId} is null`));
  if (remaining.value === 0)
    await db
      .update(projects)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(projects.id, projectId));
}
