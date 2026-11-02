import { buildSubtitleCues } from "@/lib/audio/timing";
import type { VoiceAssignment } from "@/lib/audio/voices";
import type { FinalRenderInput, RenderScene, RenderSystemAsset, TextOverlay } from "./types";
import { isFixedOpeningPreset } from "@/lib/opening/fixed-master";

export const SOUND_EFFECT_BY_PRESET: Record<string, { key: string; frequency: number }> = {
  Opening: { key: "door", frequency: 58 },
  VintageRoom: { key: "wind", frequency: 140 },
  OldBook: { key: "book", frequency: 330 },
  WatchReveal: { key: "watch-mechanical", frequency: 1040 },
  Racing: { key: "race", frequency: 120 },
  WatchMacro: { key: "watch-mechanical", frequency: 1100 },
  Ending: { key: "clock-tick", frequency: 780 },
};

export function buildFinalRenderInput(input: {
  language: "ja" | "en" | "zh";
  bgmKey: string;
  scenes: RenderScene[];
  totalSceneCount: number;
  narrationSubtitlesEnabled?: boolean;
  voiceAssignments?: VoiceAssignment[];
  openingAsset?: RenderSystemAsset | null;
  endingAsset?: RenderSystemAsset | null;
}): FinalRenderInput {
  const scenes = [...input.scenes]
    .filter((scene) => !isFixedOpeningPreset(scene.preset))
    .sort((a, b) => a.order - b.order);
  if (!scenes.length) throw new Error("MISSING_SCENE_VIDEO");
  const blockedScene = scenes.find(
    (scene) =>
      scene.visualRelevanceStatus === "ng" ||
      (scene.visualRelevanceScore != null && scene.visualRelevanceScore < 70),
  );
  if (blockedScene) throw new Error(`VISUAL_RELEVANCE_NG:${blockedScene.sceneId}`);
  const narrationSubtitlesEnabled = input.narrationSubtitlesEnabled ?? true;
  const subtitles = narrationSubtitlesEnabled
    ? buildSubtitleCues(
        scenes.map((scene) => ({
          id: scene.sceneId,
          duration: scene.duration,
          narration: scene.narration,
          narrationSegmentId: scene.narrationSegmentId,
          subtitle: scene.subtitle,
        })),
      )
    : [];
  const overlays: TextOverlay[] = [];
  let cursorMs = 0;
  scenes.forEach((scene) => {
    const durationMs = scene.duration * 1000;
    if (scene.preset === "OldBook")
      overlays.push({
        kind: "brand",
        startMs: cursorMs + Math.min(450, durationMs * 0.12),
        endMs: Math.min(cursorMs + 2350, cursorMs + durationMs - 250),
        primary: "POWER WATCH",
      });
    if (scene.preset === "Ending")
      overlays.push({
        kind: "brand",
        startMs: cursorMs + Math.min(650, durationMs * 0.18),
        endMs: cursorMs + durationMs - 300,
        primary: "POWER WATCH",
        secondary: "TIME, REMEMBERED.",
      });
    if (scene.year || scene.location)
      overlays.push({
        kind: "year-location",
        startMs: cursorMs + 250,
        endMs: Math.min(cursorMs + 2800, cursorMs + durationMs),
        primary: scene.year || "",
        secondary: scene.location || undefined,
      });
    if (!narrationSubtitlesEnabled && scene.subtitle.trim())
      overlays.push({
        kind: "evidence",
        startMs: cursorMs + Math.min(500, durationMs * 0.12),
        endMs: Math.min(cursorMs + 3_200, cursorMs + durationMs - 350),
        primary: scene.subtitle.trim(),
      });
    cursorMs += durationMs;
  });
  return {
    width: 1080,
    height: 1920,
    fps: 30,
    language: input.language,
    bgmKey: input.bgmKey,
    narrationSubtitlesEnabled,
    totalDuration:
      (input.openingAsset?.duration ?? 0) +
      scenes.reduce((sum, scene) => sum + scene.duration, 0) +
      (input.endingAsset?.recommendedDuration ?? input.endingAsset?.duration ?? 0),
    missingSceneCount: Math.max(0, input.totalSceneCount - scenes.length),
    scenes,
    subtitles,
    overlays,
    voiceAssignments: input.voiceAssignments ?? [],
    openingAsset: input.openingAsset ?? null,
    endingAsset: input.endingAsset ?? null,
    alignment: null,
  };
}

export function effectiveSystemAssetDuration(asset: RenderSystemAsset | null) {
  if (!asset) return 0;
  const start = Math.max(0, asset.recommendedStart ?? 0);
  const end = Math.min(asset.duration, asset.recommendedEnd ?? asset.duration);
  return Math.max(0, Math.min(asset.recommendedDuration ?? end - start, end - start));
}

/**
 * Keep the approved storyboard rhythm when narration subtitles are disabled.
 * Provider alignment can differ from the original text for numbers and foreign
 * words; using unmatched character offsets would otherwise place the remaining
 * duration into the final scene.
 */
export function scaleSceneDurationsToNarration<T extends { duration: number }>(
  scenes: T[],
  narrationDurationMs: number,
): T[] {
  if (!scenes.length) return scenes;
  const narrationDuration = Math.max(0.3 * scenes.length, narrationDurationMs / 1000);
  const configuredDuration = scenes.reduce((sum, scene) => sum + Math.max(0.3, scene.duration), 0);
  if (configuredDuration <= 0) return scenes;

  const scale = narrationDuration / configuredDuration;
  let allocated = 0;
  return scenes.map((scene, index) => {
    const duration =
      index === scenes.length - 1
        ? Math.max(0.3, narrationDuration - allocated)
        : Math.max(0.3, Math.max(0.3, scene.duration) * scale);
    allocated += duration;
    return { ...scene, duration };
  });
}

export function scaleTextOverlays<T extends { startMs: number; endMs: number }>(
  overlays: T[],
  scale: number,
): T[] {
  if (!Number.isFinite(scale) || scale <= 0) return overlays;
  return overlays.map((overlay) => ({
    ...overlay,
    startMs: Math.round(overlay.startMs * scale),
    endMs: Math.round(overlay.endMs * scale),
  }));
}

export function narrationObjectKey(projectId: string, audioId: string) {
  return `projects/${projectId}/audio/narration/${audioId}.mp3`;
}

export function renderObjectKey(projectId: string, renderId: string) {
  return `projects/${projectId}/renders/${renderId}.mp4`;
}
