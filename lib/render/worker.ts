import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { assertNarrationFits, buildNarrationScript, narrationSpeed } from "@/lib/audio/timing";
import {
  ElevenLabsError,
  ElevenLabsNarrationProvider,
  type NarrationProvider,
  type NarrationResult,
} from "@/lib/audio/elevenlabs";
import { narrationConfig } from "@/lib/audio/config";
import { buildAudioRecord } from "@/lib/audio/record";
import { buildSpeechSegments } from "@/lib/audio/voices";
import { getDb } from "@/lib/db";
import {
  apiUsage,
  audioRecords,
  finalRenders,
  projects,
  renderJobs,
  scenes,
  sceneVoiceAssignments,
} from "@/lib/db/schema";
import { createReadUrl, uploadPrivateObject } from "@/lib/storage";
import { createAssSubtitles } from "./ass";
import { concatSpeechAudio, probeDurationMs, renderWithFfmpeg } from "./ffmpeg";
import { narrationObjectKey, renderObjectKey } from "./plan";
import type { FinalRenderInput } from "./types";

type WorkerDependencies = {
  narration: NarrationProvider;
  upload: typeof uploadPrivateObject;
  sign: typeof createReadUrl;
  render: typeof renderWithFfmpeg;
  probe: typeof probeDurationMs;
  composeSpeech: typeof concatSpeechAudio;
  download: typeof downloadPrivateMedia;
};

const defaults = (): WorkerDependencies => ({
  narration: new ElevenLabsNarrationProvider(),
  upload: uploadPrivateObject,
  sign: createReadUrl,
  render: renderWithFfmpeg,
  probe: probeDurationMs,
  composeSpeech: concatSpeechAudio,
  download: downloadPrivateMedia,
});

export async function processFinalRenderJob(
  jobId: string,
  dependencies: WorkerDependencies = defaults(),
) {
  const db = getDb();
  const [row] = await db
    .select({ job: renderJobs, render: finalRenders })
    .from(renderJobs)
    .innerJoin(finalRenders, eq(finalRenders.id, renderJobs.renderId))
    .where(eq(renderJobs.id, jobId))
    .limit(1);
  if (!row || ["completed", "failed"].includes(row.job.status)) return;
  const now = new Date();
  await db.transaction(async (transaction) => {
    await transaction
      .update(renderJobs)
      .set({
        status: "rendering",
        attempts: row.job.attempts + 1,
        startedAt: row.job.startedAt ?? now,
        updatedAt: now,
      })
      .where(eq(renderJobs.id, jobId));
    await transaction
      .update(finalRenders)
      .set({ status: "rendering", errorCode: null, errorMessage: null, updatedAt: now })
      .where(eq(finalRenders.id, row.render.id));
  });

  const renderInput = row.render.renderInput as FinalRenderInput;
  let audioId: string | undefined;
  let stage: "narration" | "audio-upload" | "scene-download" | "ffmpeg" | "render-upload" =
    "narration";
  const workDir = await mkdtemp(path.join(tmpdir(), "power-watch-render-"));
  try {
    const narrationScript = buildNarrationScript(
      renderInput.scenes.map((scene) => ({
        id: scene.sceneId,
        duration: scene.duration,
        narration: scene.narration,
        subtitle: scene.subtitle,
      })),
      renderInput.language,
    );
    const script = renderInput.scenes
      .flatMap((scene) => [scene.narration, ...(scene.dialogue ?? []).map((line) => line.text)])
      .map((text) => text.trim())
      .filter(Boolean)
      .join(renderInput.language === "en" ? "\n\n" : "。\n\n")
      .replace(/。。/g, "。");
    const speed = narrationSpeed(script, renderInput.totalDuration, renderInput.language);
    assertNarrationFits(script, renderInput.totalDuration, speed, renderInput.language);
    const config = narrationConfig();
    const narratorVoiceId =
      (renderInput.voiceAssignments ?? []).find(
        (assignment) => assignment.role === "narration" && assignment.speakerKey === "narrator",
      )?.voiceId ?? config.defaultVoiceId;
    if (!narratorVoiceId)
      throw new ElevenLabsError("AUTH", "ElevenLabs Voice IDが未設定です");
    const [audio] = await db
      .insert(audioRecords)
      .values(
        buildAudioRecord({
          projectId: row.render.projectId,
          storyboardId: row.render.storyboardId,
          provider: dependencies.narration.name,
          model: config.model,
          voiceId: narratorVoiceId,
          language: renderInput.language,
          script,
        }),
      )
      .returning();
    audioId = audio.id;
    const narrationStarted = Date.now();
    const speechSegments = buildSpeechSegments({
      scenes: renderInput.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        preset: scene.preset,
        title: "",
        narration: scene.narration,
        narrationTone: scene.narrationTone,
        dialogue: scene.dialogue,
      })),
      assignments: renderInput.voiceAssignments ?? [],
      narrationScript,
      narratorVoiceId,
    });
    const generatedSegments: Array<{ generated: NarrationResult; path: string }> = [];
    const unavailableVoiceFallbacks: Array<{
      sceneId: string | null;
      speakerKey: string;
      role: "narration" | "dialogue";
      originalVoiceId: string;
    }> = [];
    for (const [index, segment] of speechSegments.entries()) {
      let generated: NarrationResult;
      try {
        generated = await dependencies.narration.generate({
          text: segment.text,
          speed,
          voiceId: segment.voiceId,
        });
      } catch (error) {
        if (
          error instanceof ElevenLabsError &&
          error.code === "INVALID_REQUEST" &&
          config.defaultVoiceId &&
          segment.voiceId !== config.defaultVoiceId
        ) {
          generated = await dependencies.narration.generate({
            text: segment.text,
            speed,
            voiceId: config.defaultVoiceId,
          });
          unavailableVoiceFallbacks.push({
            sceneId: segment.sceneId,
            speakerKey: segment.speakerKey,
            role: segment.role,
            originalVoiceId: segment.voiceId,
          });
        } else {
          throw error;
        }
      }
      const segmentPath = path.join(workDir, `speech-${index}.mp3`);
      await writeFile(segmentPath, generated.bytes);
      generatedSegments.push({ generated, path: segmentPath });
    }
    const narrationPath = path.join(workDir, "narration.mp3");
    await dependencies.composeSpeech(
      generatedSegments.map((segment) => segment.path),
      narrationPath,
    );
    const audioDurationMs = await dependencies.probe(narrationPath);
    stage = "audio-upload";
    const audioKey = narrationObjectKey(row.render.projectId, audio.id);
    const narrationBytes = new Uint8Array(await readFile(narrationPath));
    await dependencies.upload(audioKey, narrationBytes, "audio/mpeg");
    const characterCost = generatedSegments.reduce(
      (sum, segment) => sum + segment.generated.characterCost,
      0,
    );
    const narrationCost = (characterCost / 1000) * config.pricePerThousandCharacters;
    await db.transaction(async (transaction) => {
      for (const fallback of unavailableVoiceFallbacks) {
        const reason = `選択Voice ${fallback.originalVoiceId} が利用不可のためELEVENLABS_DEFAULT_VOICE_IDへFallback`;
        const assignmentCondition = fallback.sceneId
          ? and(
              eq(sceneVoiceAssignments.projectId, row.render.projectId),
              eq(sceneVoiceAssignments.sceneId, fallback.sceneId),
              eq(sceneVoiceAssignments.speakerKey, fallback.speakerKey),
              eq(sceneVoiceAssignments.role, fallback.role),
            )
          : and(
              eq(sceneVoiceAssignments.projectId, row.render.projectId),
              eq(sceneVoiceAssignments.speakerKey, fallback.speakerKey),
              eq(sceneVoiceAssignments.role, fallback.role),
            );
        await transaction
          .update(sceneVoiceAssignments)
          .set({
            voiceId: config.defaultVoiceId!,
            selectionSource: "default_fallback",
            selectionReason: reason,
            selectionMetadata: {
              source: "default_fallback",
              unavailableVoiceId: fallback.originalVoiceId,
            },
            updatedAt: new Date(),
          })
          .where(assignmentCondition);
        if (fallback.role === "narration")
          await transaction
            .update(projects)
            .set({
              narratorVoiceId: config.defaultVoiceId!,
              narratorSelectionReason: reason,
              updatedAt: new Date(),
            })
            .where(eq(projects.id, row.render.projectId));
        if (fallback.role === "narration")
          await transaction
            .update(scenes)
            .set({
              voiceId: config.defaultVoiceId!,
              voiceSelectionSource: "default_fallback",
              voiceSelectionMetadata: {
                source: "default_fallback",
                unavailableVoiceId: fallback.originalVoiceId,
              },
              updatedAt: new Date(),
            })
            .where(eq(scenes.projectId, row.render.projectId));
      }
      await transaction
        .update(audioRecords)
        .set({
          status: "completed",
          voiceId: unavailableVoiceFallbacks.some((item) => item.role === "narration")
            ? config.defaultVoiceId!
            : narratorVoiceId,
          durationMs: audioDurationMs,
          objectKey: audioKey,
          mimeType: "audio/mpeg",
          estimatedCost: narrationCost,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(audioRecords.id, audio.id));
      await transaction
        .update(finalRenders)
        .set({ audioRecordId: audio.id, estimatedCost: narrationCost, updatedAt: new Date() })
        .where(eq(finalRenders.id, row.render.id));
      await transaction.insert(apiUsage).values({
        projectId: row.render.projectId,
        provider: dependencies.narration.name,
        operation: "narration_generation",
        model: config.model,
        units: characterCost,
        requestId: generatedSegments
          .map((segment) => segment.generated.requestId)
          .filter(Boolean)
          .join(",") || undefined,
        durationMs: Date.now() - narrationStarted,
        estimatedCost: narrationCost,
      });
    });

    stage = "scene-download";
    const videoPaths: string[] = [];
    for (const [index, scene] of renderInput.scenes.entries()) {
      const url = await dependencies.sign(scene.objectKey, 15 * 60);
      const bytes = await dependencies.download(url, 250 * 1024 * 1024);
      const file = path.join(workDir, `scene-${index}.mp4`);
      await writeFile(file, bytes);
      videoPaths.push(file);
    }
    const subtitlePath = path.join(workDir, "overlays.ass");
    await writeFile(subtitlePath, createAssSubtitles(renderInput), "utf8");
    const outputPath = path.join(workDir, "final.mp4");
    stage = "ffmpeg";
    const renderStarted = Date.now();
    await dependencies.render(renderInput, {
      videos: videoPaths,
      narration: narrationPath,
      subtitles: subtitlePath,
      output: outputPath,
    });
    const output = new Uint8Array(await readFile(outputPath));
    if (!output.length) throw new Error("FFMPEG_EMPTY_OUTPUT");
    stage = "render-upload";
    const outputKey = renderObjectKey(row.render.projectId, row.render.id);
    await dependencies.upload(outputKey, output, "video/mp4");
    await db.transaction(async (transaction) => {
      const completedAt = new Date();
      await transaction
        .update(finalRenders)
        .set({
          status: "completed",
          durationMs: renderInput.totalDuration * 1000,
          outputObjectKey: outputKey,
          errorCode: null,
          errorMessage: null,
          updatedAt: completedAt,
          completedAt,
        })
        .where(eq(finalRenders.id, row.render.id));
      await transaction
        .update(renderJobs)
        .set({
          status: "completed",
          errorCode: null,
          errorMessage: null,
          updatedAt: completedAt,
          completedAt,
        })
        .where(eq(renderJobs.id, jobId));
      await transaction.insert(apiUsage).values({
        projectId: row.render.projectId,
        provider: "internal",
        operation: "final_render",
        model: "remotion-ffmpeg-h264-v1",
        units: Math.round(renderInput.totalDuration * renderInput.fps),
        durationMs: Date.now() - renderStarted,
        estimatedCost: 0,
      });
    });
  } catch (error) {
    await failFinalRender(jobId, row.render.id, audioId, stage, error);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function failFinalRender(
  jobId: string,
  renderId: string,
  audioId: string | undefined,
  stage: string,
  error: unknown,
) {
  const db = getDb();
  const details = renderError(stage, error);
  const now = new Date();
  await db.transaction(async (transaction) => {
    await transaction
      .update(renderJobs)
      .set({
        status: "failed",
        errorCode: details.code,
        errorMessage: details.message,
        updatedAt: now,
        completedAt: now,
      })
      .where(eq(renderJobs.id, jobId));
    await transaction
      .update(finalRenders)
      .set({
        status: "failed",
        errorCode: details.code,
        errorMessage: details.message,
        updatedAt: now,
        completedAt: now,
      })
      .where(eq(finalRenders.id, renderId));
    if (audioId && (stage === "narration" || stage === "audio-upload"))
      await transaction
        .update(audioRecords)
        .set({
          status: "failed",
          errorCode: details.code,
          errorMessage: details.message,
          updatedAt: now,
          completedAt: now,
        })
        .where(eq(audioRecords.id, audioId));
  });
}

function renderError(stage: string, error: unknown) {
  if (error instanceof ElevenLabsError)
    return { code: `ELEVENLABS_${error.code}`, message: error.message };
  if (error instanceof Error && error.message === "NARRATION_TOO_LONG")
    return {
      code: "NARRATION_TOO_LONG",
      message: "NarrationがScene尺を大きく超えます。原稿を短くして再実行してください",
    };
  const map: Record<string, { code: string; message: string }> = {
    "audio-upload": { code: "R2_AUDIO_UPLOAD_FAILED", message: "NarrationのR2保存に失敗しました" },
    "scene-download": { code: "MISSING_SCENE_VIDEO", message: "Scene動画を取得できませんでした" },
    ffmpeg: { code: "FFMPEG_FAILED", message: "完成動画の結合処理に失敗しました" },
    "render-upload": { code: "R2_RENDER_UPLOAD_FAILED", message: "完成動画のR2保存に失敗しました" },
  };
  return map[stage] || { code: "RENDER_FAILED", message: "Final Renderに失敗しました" };
}

async function downloadPrivateMedia(url: string, maxBytes: number) {
  const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`MEDIA_DOWNLOAD_HTTP_${response.status}`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("MEDIA_TOO_LARGE");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > maxBytes) throw new Error("MEDIA_SIZE_INVALID");
  return bytes;
}
