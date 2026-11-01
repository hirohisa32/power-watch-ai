import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import {
  buildAlignedSubtitleCues,
  buildDurationFallbackAlignment,
  buildNarrationScript,
  normalizeProviderAlignment,
  sceneSpeechWindows,
  type NarrationAlignmentData,
} from "@/lib/audio/timing";
import { saveElevenLabsGenerationAudit } from "@/lib/audio/audit";
import {
  ElevenLabsError,
  ElevenLabsNarrationProvider,
  type NarrationProvider,
  type NarrationResult,
  type NarrationTimestampResult,
} from "@/lib/audio/elevenlabs";
import { narrationConfig } from "@/lib/audio/config";
import { buildAudioRecord } from "@/lib/audio/record";
import { buildSpeechSegments } from "@/lib/audio/voices";
import { getDb } from "@/lib/db";
import { apiUsage, audioRecords, bgmAssets, finalRenders, renderJobs } from "@/lib/db/schema";
import { createReadUrl, uploadPrivateObject } from "@/lib/storage";
import { createAssSubtitles } from "./ass";
import { concatSpeechAudio, probeDurationMs, renderWithFfmpeg } from "./ffmpeg";
import { narrationObjectKey, renderObjectKey } from "./plan";
import type { FinalRenderInput } from "./types";
import { settleCompletedRender } from "@/lib/billing/service";
import { HAYASHI_VOICE } from "@/lib/system-media/config";

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

  let renderInput = row.render.renderInput as FinalRenderInput;
  let audioId: string | undefined;
  let stage:
    | "narration"
    | "audio-upload"
    | "scene-download"
    | "system-media-download"
    | "bgm-download"
    | "ffmpeg"
    | "render-upload" = "narration";
  const workDir = await mkdtemp(path.join(tmpdir(), "power-watch-render-"));
  try {
    const bodyDuration = renderInput.scenes.reduce((sum, scene) => sum + scene.duration, 0);
    const narrationScript = buildNarrationScript(
      renderInput.scenes.map((scene) => ({
        id: scene.sceneId,
        duration: scene.duration,
        narration: scene.narration,
        subtitle: scene.subtitle,
      })),
      renderInput.language,
    );
    const hasDialogue = renderInput.scenes.some((scene) =>
      (scene.dialogue ?? []).some((line) => line.text.trim()),
    );
    const script = hasDialogue
      ? renderInput.scenes
          .flatMap((scene) => [scene.narration, ...(scene.dialogue ?? []).map((line) => line.text)])
          .map((text) => text.trim())
          .filter(Boolean)
          .join("\n\n")
      : narrationScript;
    const config = narrationConfig();
    const narratorVoiceId = HAYASHI_VOICE.voiceId;
    if (config.model !== HAYASHI_VOICE.model)
      throw new ElevenLabsError(
        "INVALID_REQUEST",
        "Narration ModelがProduction固定設定と一致しません",
      );
    const narrationPath = path.join(workDir, "narration.mp3");
    let narrationAlignment: NarrationAlignmentData | null = null;
    let narrationDurationMs = 0;
    const [cachedAudio] = await db
      .select()
      .from(audioRecords)
      .where(
        and(
          eq(audioRecords.projectId, row.render.projectId),
          eq(audioRecords.storyboardId, row.render.storyboardId),
          eq(audioRecords.provider, dependencies.narration.name),
          eq(audioRecords.model, config.model),
          eq(audioRecords.voiceId, narratorVoiceId),
          eq(audioRecords.language, renderInput.language),
          eq(audioRecords.script, script),
          isNotNull(audioRecords.objectKey),
        ),
      )
      .orderBy(desc(audioRecords.createdAt))
      .limit(1);
    if (cachedAudio?.objectKey) {
      audioId = cachedAudio.id;
      const audioUrl = await dependencies.sign(cachedAudio.objectKey, 15 * 60);
      const narrationBytes = await dependencies.download(audioUrl, 25 * 1024 * 1024);
      await writeFile(narrationPath, narrationBytes);
      narrationDurationMs =
        cachedAudio.durationMs ?? (await dependencies.probe(narrationPath)) ?? 0;
      narrationAlignment =
        (cachedAudio.alignment as NarrationAlignmentData | null) ??
        buildDurationFallbackAlignment(script, narrationDurationMs);
      await db
        .update(finalRenders)
        .set({ audioRecordId: cachedAudio.id, estimatedCost: 0, updatedAt: new Date() })
        .where(eq(finalRenders.id, row.render.id));
    } else {
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
      const generatedSegments: Array<{
        generated: NarrationResult | NarrationTimestampResult;
        path: string;
        durationMs: number;
        alignment: NarrationAlignmentData;
      }> = [];
      for (const [index, segment] of speechSegments.entries()) {
        const generationInput = {
          originalScript: segment.text,
          text: segment.text,
          speed: 1,
          voiceId: narratorVoiceId,
          language: renderInput.language,
        } as const;
        const generated: NarrationResult | NarrationTimestampResult = dependencies.narration
          .generateWithTimestamps
          ? await dependencies.narration.generateWithTimestamps(generationInput)
          : await dependencies.narration.generate(generationInput);
        if (generated.audit)
          await saveElevenLabsGenerationAudit({
            audit: generated.audit,
            purpose: "final_narration",
            projectId: row.render.projectId,
            storyboardId: row.render.storyboardId,
            audioRecordId: audio.id,
            videoId: row.render.id,
            requestId: generated.requestId,
            characterCost: generated.characterCost,
          });
        const segmentPath = path.join(workDir, `speech-${index}.mp3`);
        await writeFile(segmentPath, generated.bytes);
        const durationMs = (await dependencies.probe(segmentPath)) ?? 0;
        const timestamped =
          "normalizedAlignment" in generated
            ? (generated as NarrationTimestampResult)
            : null;
        const providerAlignment = timestamped
          ? (timestamped.normalizedAlignment ?? timestamped.alignment)
          : null;
        generatedSegments.push({
          generated,
          path: segmentPath,
          durationMs,
          alignment: providerAlignment
            ? normalizeProviderAlignment(providerAlignment)
            : buildDurationFallbackAlignment(segment.text, durationMs),
        });
      }
      await dependencies.composeSpeech(
        generatedSegments.map((segment) => segment.path),
        narrationPath,
      );
      const audioDurationMs = (await dependencies.probe(narrationPath)) ?? 0;
      narrationDurationMs = audioDurationMs;
      narrationAlignment = mergeSegmentAlignments(generatedSegments);
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
        await transaction
          .update(audioRecords)
          .set({
            status: "completed",
            voiceId: narratorVoiceId,
            durationMs: audioDurationMs,
            alignment: narrationAlignment,
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
          requestId:
            generatedSegments
              .map((segment) => segment.generated.requestId)
              .filter(Boolean)
              .join(",") || undefined,
          durationMs: Date.now() - narrationStarted,
          estimatedCost: narrationCost,
        });
      });
    }

    if (!narrationDurationMs)
      narrationDurationMs =
        (await dependencies.probe(narrationPath)) ?? Math.round(bodyDuration * 1000);
    narrationAlignment ??= buildDurationFallbackAlignment(script, narrationDurationMs);
    renderInput = synchronizeRenderInput(renderInput, narrationAlignment, narrationDurationMs);
    await db
      .update(finalRenders)
      .set({
        renderInput,
        durationMs: Math.round(renderInput.totalDuration * 1000),
        updatedAt: new Date(),
      })
      .where(eq(finalRenders.id, row.render.id));

    stage = "scene-download";
    const videoPaths: string[] = [];
    for (const [index, scene] of renderInput.scenes.entries()) {
      const url = await dependencies.sign(scene.objectKey, 15 * 60);
      const bytes = await dependencies.download(url, 250 * 1024 * 1024);
      const file = path.join(workDir, `scene-${index}.mp4`);
      await writeFile(file, bytes);
      videoPaths.push(file);
    }
    stage = "system-media-download";
    const openingPath = renderInput.openingAsset
      ? path.join(workDir, "selected-opening.mp4")
      : undefined;
    const endingPath = renderInput.endingAsset
      ? path.join(workDir, "selected-ending.mp4")
      : undefined;
    if (renderInput.openingAsset && openingPath) {
      const url = await dependencies.sign(renderInput.openingAsset.storagePath, 15 * 60);
      await writeFile(openingPath, await dependencies.download(url, 250 * 1024 * 1024));
    }
    if (renderInput.endingAsset && endingPath) {
      const url = await dependencies.sign(renderInput.endingAsset.storagePath, 15 * 60);
      await writeFile(endingPath, await dependencies.download(url, 250 * 1024 * 1024));
    }
    const subtitlePath = path.join(workDir, "overlays.ass");
    await writeFile(subtitlePath, createAssSubtitles(renderInput), "utf8");
    stage = "bgm-download";
    const [bgm] = await db
      .select()
      .from(bgmAssets)
      .where(and(eq(bgmAssets.key, renderInput.bgmKey), eq(bgmAssets.active, true)))
      .limit(1);
    if (!bgm) throw new Error("BGM_NOT_APPROVED");
    const bgmPath = path.join(workDir, `bgm${bgm.extension}`);
    const bgmUrl = await dependencies.sign(bgm.filePath, 15 * 60);
    await writeFile(bgmPath, await dependencies.download(bgmUrl, 25 * 1024 * 1024));
    const outputPath = path.join(workDir, "final.mp4");
    stage = "ffmpeg";
    const renderStarted = Date.now();
    await dependencies.render(renderInput, {
      opening: openingPath,
      ending: endingPath,
      videos: videoPaths,
      narration: narrationPath,
      bgm: bgmPath,
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
    try {
      await settleCompletedRender(row.render.id);
    } catch (settlementError) {
      // Render completion must remain successful when the independent FX source is unavailable.
      // The pending settlement is exposed to admins and can be retried without changing video data.
      console.error("Project cost settlement is pending", {
        renderId: row.render.id,
        error: settlementError instanceof Error ? settlementError.message : String(settlementError),
      });
    }
  } catch (error) {
    console.error("Final render job failed", {
      jobId,
      renderId: row.render.id,
      stage,
      error: error instanceof Error ? error.message : String(error),
    });
    await failFinalRender(jobId, row.render.id, audioId, stage, error);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export function allocateSpeechSegmentDurations(
  input: FinalRenderInput,
  segments: Array<{ sceneId: string | null; text: string }>,
) {
  const result = new Array<number>(segments.length).fill(0);
  for (const scene of input.scenes) {
    const indexes = segments
      .map((segment, index) => ({ segment, index }))
      .filter(({ segment }) => segment.sceneId === scene.sceneId);
    if (!indexes.length) continue;
    const weights = indexes.map(({ segment }) => Math.max(1, [...segment.text].length));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    indexes.forEach(({ index }, localIndex) => {
      result[index] = Number(((scene.duration * weights[localIndex]) / total).toFixed(3));
    });
  }
  const unassigned = result.map((value, index) => ({ value, index })).filter(({ value }) => !value);
  const assignedTotal = result.reduce((sum, value) => sum + value, 0);
  const remaining = Math.max(0.5, input.totalDuration - assignedTotal);
  unassigned.forEach(({ index }) => (result[index] = remaining / unassigned.length));
  return result;
}

function mergeSegmentAlignments(
  segments: Array<{ durationMs: number; alignment: NarrationAlignmentData }>,
): NarrationAlignmentData {
  const characters: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  let offsetSeconds = 0;
  let providerOnly = true;
  segments.forEach((segment) => {
    characters.push(...segment.alignment.characters);
    starts.push(
      ...segment.alignment.characterStartTimesSeconds.map((value) => value + offsetSeconds),
    );
    ends.push(...segment.alignment.characterEndTimesSeconds.map((value) => value + offsetSeconds));
    providerOnly &&= segment.alignment.source === "provider";
    offsetSeconds += segment.durationMs / 1000;
  });
  return {
    characters,
    characterStartTimesSeconds: starts,
    characterEndTimesSeconds: ends,
    source: providerOnly ? "provider" : "duration_fallback",
  };
}

export function synchronizeRenderInput(
  input: FinalRenderInput,
  alignment: NarrationAlignmentData,
  narrationDurationMs: number,
): FinalRenderInput {
  const narrationScenes = input.scenes.map((scene) => ({
    id: scene.sceneId,
    narrationSegmentId: scene.narrationSegmentId,
    duration: scene.duration,
    narration: scene.narration,
    subtitle: scene.subtitle,
  }));
  const windows = sceneSpeechWindows(narrationScenes, alignment, input.language);
  const scenes = input.scenes.map((scene, index) => {
    const startMs = index === 0 ? 0 : (windows[index]?.speechStartMs ?? 0);
    const nextStartMs = windows[index + 1]?.speechStartMs ?? narrationDurationMs;
    return { ...scene, duration: Math.max(0.3, (nextStartMs - startMs) / 1000) };
  });
  const endingDuration = input.endingAsset
    ? (input.endingAsset.recommendedDuration ?? input.endingAsset.duration)
    : 0;
  return {
    ...input,
    scenes,
    subtitles: buildAlignedSubtitleCues(narrationScenes, alignment, 75, input.language),
    alignment,
    totalDuration:
      (input.openingAsset?.duration ?? 0) + narrationDurationMs / 1000 + endingDuration,
  };
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
  const technicalMessage = error instanceof Error ? error.message : String(error);
  const now = new Date();
  await db.transaction(async (transaction) => {
    await transaction
      .update(renderJobs)
      .set({
        status: "failed",
        errorCode: details.code,
        errorMessage: `${details.message} [${technicalMessage.slice(-1800)}]`,
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
    "system-media-download": {
      code: "SYSTEM_MEDIA_NOT_AVAILABLE",
      message: "選択したオープニングまたは締め動画を取得できませんでした",
    },
    "bgm-download": { code: "BGM_NOT_AVAILABLE", message: "承認済みBGMを取得できませんでした" },
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
