import "server-only";
import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  finalRenders,
  projects,
  renderJobs,
  sceneVoiceAssignments,
  scenes,
  storyboards,
  systemVideoAssets,
  videoGenerations,
} from "@/lib/db/schema";
import type { VoiceAssignment } from "@/lib/audio/voices";
import { HAYASHI_VOICE } from "@/lib/system-media/config";
import { buildFinalRenderInput } from "./plan";
import { isFixedOpeningPreset } from "@/lib/opening/policy";

export class RenderRequestError extends Error {
  name = "RenderRequestError";
}

export async function createFinalRenderJob(input: { projectId: string; userId: string }) {
  const db = getDb();
  return db.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${input.projectId}))`);
    const [project] = await transaction
      .select()
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.userId, input.userId)))
      .limit(1);
    if (!project) throw new RenderRequestError("プロジェクトが見つかりません");
    const [storyboard] = await transaction
      .select()
      .from(storyboards)
      .where(and(eq(storyboards.projectId, input.projectId), eq(storyboards.isActive, true)))
      .limit(1);
    if (!storyboard) throw new RenderRequestError("Storyboardが見つかりません");
    const active = await transaction
      .select({ id: finalRenders.id })
      .from(finalRenders)
      .where(
        and(
          eq(finalRenders.projectId, input.projectId),
          inArray(finalRenders.status, ["queued", "rendering"]),
        ),
      )
      .limit(1);
    if (active.length) throw new RenderRequestError("完成動画はレンダリング中です");
    const rows = await transaction
      .select({
        scene: scenes,
        generationId: videoGenerations.id,
        generationStatus: videoGenerations.status,
        outputObjectKey: videoGenerations.outputObjectKey,
      })
      .from(scenes)
      .leftJoin(videoGenerations, eq(videoGenerations.id, scenes.selectedGenerationId))
      .where(eq(scenes.storyboardId, storyboard.id))
      .orderBy(scenes.order);
    const bodyRows = rows.filter((row) => !isFixedOpeningPreset(row.scene.preset));
    const renderable = bodyRows
      .filter(
        (row) => row.generationId && row.generationStatus === "completed" && row.outputObjectKey,
      )
      .map((row) => ({
        sceneId: row.scene.id,
        generationId: row.generationId!,
        order: row.scene.order,
        preset: row.scene.preset,
        transition: row.scene.transition,
        duration: row.scene.duration,
        narration: row.scene.narration,
        narrationSegmentId: row.scene.narrationSegmentId,
        narrationTone: row.scene.narrationTone,
        dialogue: row.scene.dialogue,
        subtitle: row.scene.subtitle,
        visualIntent: row.scene.visualIntent,
        visualSubject: row.scene.visualSubject,
        historicalPeriod: row.scene.historicalPeriod,
        characterId: row.scene.characterId,
        productPhotoId: row.scene.productPhotoId,
        productPhotoRole: row.scene.productPhotoRole,
        visualType: row.scene.visualType,
        visualRelevanceScore: row.scene.visualRelevanceScore,
        visualRelevanceStatus: row.scene.visualRelevanceStatus,
        year: row.scene.year,
        location: row.scene.location,
        objectKey: row.outputObjectKey!,
      }));
    const voiceAssignments: VoiceAssignment[] = renderable.flatMap((scene) => [
      {
        sceneId: scene.sceneId,
        speakerKey: "narrator",
        role: "narration" as const,
        voiceId: HAYASHI_VOICE.voiceId,
        tone: scene.narrationTone || "documentary",
        selectionSource: "production_fixed" as const,
        selectionReason: `通常生成は${HAYASHI_VOICE.name} / ${HAYASHI_VOICE.model}に固定`,
        selectionMetadata: { fixed: true, model: HAYASHI_VOICE.model },
      },
      ...(scene.dialogue ?? []).map((line) => ({
        sceneId: scene.sceneId,
        speakerKey: line.speaker.trim().toLocaleLowerCase().replace(/\s+/g, "-") || "speaker",
        role: "dialogue" as const,
        voiceId: HAYASHI_VOICE.voiceId,
        tone: line.tone || "neutral",
        selectionSource: "production_fixed" as const,
        selectionReason: `通常生成は${HAYASHI_VOICE.name} / ${HAYASHI_VOICE.model}に固定`,
        selectionMetadata: { fixed: true, model: HAYASHI_VOICE.model },
      })),
    ]);
    await transaction
      .update(projects)
      .set({
        narratorVoiceId: HAYASHI_VOICE.voiceId,
        narratorSelectionReason: `通常生成は${HAYASHI_VOICE.name} / ${HAYASHI_VOICE.model}に固定`,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, project.id));
    for (const assignment of voiceAssignments) {
      await transaction
        .insert(sceneVoiceAssignments)
        .values({
          projectId: project.id,
          storyboardId: storyboard.id,
          sceneId: assignment.sceneId,
          speakerKey: assignment.speakerKey,
          role: assignment.role,
          voiceId: assignment.voiceId,
          tone: assignment.tone,
          selectionSource: assignment.selectionSource,
          selectionReason: assignment.selectionReason,
          selectionMetadata: assignment.selectionMetadata,
          manualOverride: assignment.manualOverride ?? false,
        })
        .onConflictDoUpdate({
          target: [
            sceneVoiceAssignments.sceneId,
            sceneVoiceAssignments.speakerKey,
            sceneVoiceAssignments.role,
          ],
          set: {
            voiceId: assignment.voiceId,
            tone: assignment.tone,
            selectionSource: assignment.selectionSource,
            selectionReason: assignment.selectionReason,
            selectionMetadata: assignment.selectionMetadata,
            manualOverride: assignment.manualOverride ?? false,
            updatedAt: new Date(),
          },
        });
      if (assignment.role === "narration")
        await transaction
          .update(scenes)
          .set({
            voiceId: assignment.voiceId,
            voiceSelectionSource: assignment.selectionSource,
            voiceSelectionMetadata: assignment.selectionMetadata,
            updatedAt: new Date(),
          })
          .where(eq(scenes.id, assignment.sceneId));
    }
    const [openingAsset] = project.openingAssetId
      ? await transaction
          .select()
          .from(systemVideoAssets)
          .where(
            and(
              eq(systemVideoAssets.id, project.openingAssetId),
              eq(systemVideoAssets.type, "opening"),
              eq(systemVideoAssets.active, true),
            ),
          )
          .limit(1)
      : [];
    const [endingAsset] = project.endingAssetId
      ? await transaction
          .select()
          .from(systemVideoAssets)
          .where(
            and(
              eq(systemVideoAssets.id, project.endingAssetId),
              eq(systemVideoAssets.type, "ending"),
              eq(systemVideoAssets.active, true),
            ),
          )
          .limit(1)
      : [];
    if (project.openingAssetId && !openingAsset)
      throw new RenderRequestError("選択したオープニン素材を利用できません");
    if (project.endingAssetId && !endingAsset)
      throw new RenderRequestError("選択した締め動画素材を利用できません");
    let renderInput;
    try {
      renderInput = buildFinalRenderInput({
        language: project.language,
        bgmKey: project.bgmKey,
        scenes: renderable,
        totalSceneCount: bodyRows.length,
        voiceAssignments,
        openingAsset: openingAsset ? toRenderSystemAsset(openingAsset) : null,
        endingAsset: endingAsset ? toRenderSystemAsset(endingAsset) : null,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "MISSING_SCENE_VIDEO")
        throw new RenderRequestError("選択済みのScene動画がありません");
      throw error;
    }
    const [latest] = await transaction
      .select({ version: max(finalRenders.version) })
      .from(finalRenders)
      .where(eq(finalRenders.projectId, input.projectId));
    const [render] = await transaction
      .insert(finalRenders)
      .values({
        projectId: input.projectId,
        storyboardId: storyboard.id,
        version: (latest.version ?? 0) + 1,
        bgmKey: project.bgmKey,
        renderInput,
      })
      .returning();
    const [job] = await transaction
      .insert(renderJobs)
      .values({ projectId: input.projectId, renderId: render.id })
      .returning();
    return { render, job };
  });
}

function toRenderSystemAsset(asset: typeof systemVideoAssets.$inferSelect) {
  return {
    id: asset.id,
    key: asset.key,
    storagePath: asset.storagePath,
    duration: asset.durationMs / 1000,
    width: asset.width,
    height: asset.height,
    fps: asset.fps,
    hasAudio: asset.hasAudio,
    recommendedStart: asset.recommendedStartMs / 1000,
    recommendedEnd: asset.recommendedEndMs == null ? undefined : asset.recommendedEndMs / 1000,
    recommendedDuration:
      asset.recommendedDurationMs == null ? undefined : asset.recommendedDurationMs / 1000,
  };
}

export async function listProjectRenders(projectId: string) {
  return getDb()
    .select()
    .from(finalRenders)
    .where(eq(finalRenders.projectId, projectId))
    .orderBy(desc(finalRenders.createdAt));
}

export async function markRenderEnqueueFailed(jobId: string, message: string) {
  const db = getDb();
  const [job] = await db
    .update(renderJobs)
    .set({
      status: "failed",
      errorCode: "QUEUE_SEND_FAILED",
      errorMessage: message,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(renderJobs.id, jobId))
    .returning({ renderId: renderJobs.renderId });
  if (job)
    await db
      .update(finalRenders)
      .set({
        status: "failed",
        errorCode: "QUEUE_SEND_FAILED",
        errorMessage: "Final Renderを開始できませんでした",
        updatedAt: new Date(),
      })
      .where(eq(finalRenders.id, job.renderId));
}
