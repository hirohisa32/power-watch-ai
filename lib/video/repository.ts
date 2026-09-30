import "server-only";
import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  assets,
  projects,
  scenes,
  storyboards,
  videoGenerations,
  videoJobs,
} from "@/lib/db/schema";
import { buildVideoPrompt } from "./prompt";
import { estimateVideoCost, providerDurationForScene } from "./cost";
import { modelForStyle, videoConfig } from "./config";
import { pickReferenceAssetIds } from "./orchestration";
import { isFixedOpeningPreset } from "@/lib/opening/policy";

export class GenerationRequestError extends Error {
  name = "GenerationRequestError";
}

export async function createGenerationJob(input: {
  projectId: string;
  sceneId: string;
  userId: string;
  regenerationInstruction?: string;
}) {
  const db = getDb();
  return db.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${input.sceneId}))`);
    const [owned] = await transaction
      .select({ scene: scenes, project: projects })
      .from(scenes)
      .innerJoin(projects, eq(projects.id, scenes.projectId))
      .innerJoin(storyboards, eq(storyboards.id, scenes.storyboardId))
      .where(
        and(
          eq(scenes.id, input.sceneId),
          eq(scenes.projectId, input.projectId),
          eq(projects.userId, input.userId),
          eq(storyboards.isActive, true),
        ),
      )
      .limit(1);
    if (!owned) throw new GenerationRequestError("Sceneが見つかりません");
    if (isFixedOpeningPreset(owned.scene.preset))
      throw new GenerationRequestError("Openingは固定System Assetのため生成できません");
    const active = await transaction
      .select({ id: videoGenerations.id })
      .from(videoGenerations)
      .where(
        and(
          eq(videoGenerations.sceneId, input.sceneId),
          inArray(videoGenerations.status, ["queued", "generating"]),
        ),
      )
      .limit(1);
    if (active.length) throw new GenerationRequestError("このSceneは生成処理中です");

    const matchingAssets = owned.scene.watchReference
      ? await transaction
          .select()
          .from(assets)
          .where(
            and(
              eq(assets.projectId, input.projectId),
              ...(owned.scene.preferredAssetLabels.length
                ? [inArray(assets.label, owned.scene.preferredAssetLabels)]
                : []),
            ),
          )
      : [];
    const referenceAssetIds = pickReferenceAssetIds(
      matchingAssets,
      owned.scene.preferredAssetLabels,
      owned.scene.preset,
    );
    const [latest] = await transaction
      .select({ version: max(videoGenerations.version) })
      .from(videoGenerations)
      .where(eq(videoGenerations.sceneId, input.sceneId));
    const version = (latest.version ?? 0) + 1;
    const model = modelForStyle(owned.project.style);
    const providerDuration = providerDurationForScene(owned.scene.duration);
    const prompt = buildVideoPrompt(
      { ...owned.scene, duration: providerDuration, referenceAvailable: referenceAssetIds.length > 0 },
      owned.project.style,
      input.regenerationInstruction,
    );
    const estimate = estimateVideoCost(model, providerDuration, videoConfig().creditCostUsd);
    const [generation] = await transaction
      .insert(videoGenerations)
      .values({
        projectId: input.projectId,
        sceneId: input.sceneId,
        version,
        provider: "runway",
        model,
        prompt,
        regenerationInstruction: input.regenerationInstruction,
        referenceAssetIds,
        requestedDuration: providerDuration,
        estimatedCostCredits: estimate.credits,
        estimatedCostUsd: estimate.usd,
      })
      .returning();
    const [job] = await transaction
      .insert(videoJobs)
      .values({
        projectId: input.projectId,
        sceneId: input.sceneId,
        generationId: generation.id,
      })
      .returning();
    await transaction
      .update(projects)
      .set({ status: "generating", updatedAt: new Date() })
      .where(eq(projects.id, input.projectId));
    return { generation, job };
  });
}

export async function markEnqueueFailed(jobId: string, message: string) {
  const db = getDb();
  const [job] = await db
    .update(videoJobs)
    .set({
      status: "failed",
      errorCode: "QUEUE_SEND_FAILED",
      errorMessage: message,
      completedAt: new Date(),
    })
    .where(eq(videoJobs.id, jobId))
    .returning({ generationId: videoJobs.generationId });
  if (job)
    await db
      .update(videoGenerations)
      .set({
        status: "failed",
        errorCode: "QUEUE_SEND_FAILED",
        errorMessage: message,
        updatedAt: new Date(),
      })
      .where(eq(videoGenerations.id, job.generationId));
}

export async function listSceneGenerations(projectId: string) {
  return getDb()
    .select()
    .from(videoGenerations)
    .where(eq(videoGenerations.projectId, projectId))
    .orderBy(videoGenerations.sceneId, desc(videoGenerations.version));
}

export async function selectGeneration(input: {
  projectId: string;
  sceneId: string;
  generationId: string;
  userId: string;
}) {
  const db = getDb();
  const [generation] = await db
    .select({ id: videoGenerations.id })
    .from(videoGenerations)
    .innerJoin(projects, eq(projects.id, videoGenerations.projectId))
    .where(
      and(
        eq(videoGenerations.id, input.generationId),
        eq(videoGenerations.sceneId, input.sceneId),
        eq(videoGenerations.projectId, input.projectId),
        eq(videoGenerations.status, "completed"),
        eq(projects.userId, input.userId),
      ),
    )
    .limit(1);
  if (!generation) throw new GenerationRequestError("選択可能なGenerationが見つかりません");
  await db
    .update(scenes)
    .set({ selectedGenerationId: generation.id, updatedAt: new Date() })
    .where(and(eq(scenes.id, input.sceneId), eq(scenes.projectId, input.projectId)));
}
