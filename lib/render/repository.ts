import "server-only";
import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  apiUsage,
  finalRenders,
  projects,
  renderJobs,
  sceneVoiceAssignments,
  scenes,
  storyboards,
  videoGenerations,
  voicePresets,
} from "@/lib/db/schema";
import { narrationConfig } from "@/lib/audio/config";
import { ElevenLabsNarrationProvider } from "@/lib/audio/elevenlabs";
import { VoiceRouter } from "@/lib/audio/router";
import type { ApprovedVoicePreset } from "@/lib/audio/voices";
import { buildFinalRenderInput } from "./plan";

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
    const renderable = rows
      .filter(
        (row) => row.generationId && row.generationStatus === "completed" && row.outputObjectKey,
      )
      .map((row) => ({
        sceneId: row.scene.id,
        generationId: row.generationId!,
        order: row.scene.order,
        preset: row.scene.preset,
        duration: row.scene.duration,
        narration: row.scene.narration,
        narrationTone: row.scene.narrationTone,
        dialogue: row.scene.dialogue,
        subtitle: row.scene.subtitle,
        year: row.scene.year,
        location: row.scene.location,
        objectKey: row.outputObjectKey!,
      }));
    const presetRows = await transaction
      .select()
      .from(voicePresets)
      .where(eq(voicePresets.approved, true));
    const savedAssignmentRows = await transaction
      .select({
        speakerKey: sceneVoiceAssignments.speakerKey,
        role: sceneVoiceAssignments.role,
        voiceId: sceneVoiceAssignments.voiceId,
        selectionSource: sceneVoiceAssignments.selectionSource,
        selectionReason: sceneVoiceAssignments.selectionReason,
        selectionMetadata: sceneVoiceAssignments.selectionMetadata,
        manualOverride: sceneVoiceAssignments.manualOverride,
      })
      .from(sceneVoiceAssignments)
      .where(eq(sceneVoiceAssignments.projectId, project.id));
    let voicePlan;
    const voiceRouteStarted = Date.now();
    try {
      voicePlan = await new VoiceRouter(new ElevenLabsNarrationProvider()).select({
        language: project.language,
        style: project.style,
        scenes: renderable.map((scene) => ({
          sceneId: scene.sceneId,
          preset: scene.preset,
          title: rows.find((row) => row.scene.id === scene.sceneId)?.scene.title ?? "",
          narration: scene.narration,
          narrationTone: scene.narrationTone,
          dialogue: scene.dialogue,
          characterContext: rows.find((row) => row.scene.id === scene.sceneId)?.scene.title ?? "",
        })),
        presets: presetRows.map(
          (preset): ApprovedVoicePreset => ({
            id: preset.id,
            key: preset.key,
            voiceId: preset.voiceId,
            name: preset.name,
            gender:
              preset.gender === "female" || preset.gender === "neutral"
                ? preset.gender
                : "male",
            roles: preset.roles,
            tones: preset.tones,
            languages: preset.languages,
            priority: preset.priority,
            approved: preset.approved,
          }),
        ),
        defaultVoiceId: narrationConfig().defaultVoiceId,
        projectNarratorVoiceId: project.narratorVoiceId,
        projectNarratorSelectionReason: project.narratorSelectionReason,
        savedAssignments: savedAssignmentRows,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "ELEVENLABS_DEFAULT_VOICE_ID_REQUIRED")
        throw new RenderRequestError(
          "ELEVENLABS_DEFAULT_VOICE_IDを設定してください",
        );
      throw error;
    }
    if (voicePlan.librarySearch.performed)
      await transaction.insert(apiUsage).values({
        projectId: project.id,
        provider: "elevenlabs",
        operation: "voice_library_search",
        model: "shared-voices-v1",
        units: voicePlan.librarySearch.candidateCount,
        durationMs: Date.now() - voiceRouteStarted,
        estimatedCost: 0,
      });
    if (!project.narratorVoiceId || !project.narratorSelectionReason)
      await transaction
        .update(projects)
        .set({
          narratorVoiceId: voicePlan.narratorVoiceId,
          narratorSelectionReason: voicePlan.narratorSelectionReason,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, project.id));
    for (const assignment of voicePlan.assignments) {
      await transaction
        .insert(sceneVoiceAssignments)
        .values({
          projectId: project.id,
          storyboardId: storyboard.id,
          sceneId: assignment.sceneId,
          speakerKey: assignment.speakerKey,
          role: assignment.role,
          voicePresetId: assignment.voicePresetId,
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
            voicePresetId: assignment.voicePresetId,
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
    let renderInput;
    try {
      renderInput = buildFinalRenderInput({
        language: project.language,
        bgmKey: project.bgmKey,
        scenes: renderable,
        totalSceneCount: rows.length,
        voiceAssignments: voicePlan.assignments,
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
