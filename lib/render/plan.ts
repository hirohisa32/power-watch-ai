import { buildSubtitleCues } from "@/lib/audio/timing";
import type { VoiceAssignment } from "@/lib/audio/voices";
import type { FinalRenderInput, RenderScene, TextOverlay } from "./types";
import { FIXED_OPENING_MASTER, isFixedOpeningPreset } from "@/lib/opening/fixed-master";

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
  voiceAssignments?: VoiceAssignment[];
}): FinalRenderInput {
  const scenes = [...input.scenes]
    .filter((scene) => !isFixedOpeningPreset(scene.preset))
    .sort((a, b) => a.order - b.order);
  if (!scenes.length) throw new Error("MISSING_SCENE_VIDEO");
  const subtitles = buildSubtitleCues(
    scenes.map((scene) => ({
      id: scene.sceneId,
      duration: scene.duration,
      narration: scene.narration,
      subtitle: scene.narration,
    })),
  );
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
    cursorMs += durationMs;
  });
  return {
    width: 1080,
    height: 1920,
    fps: FIXED_OPENING_MASTER.fps,
    language: input.language,
    bgmKey: input.bgmKey,
    totalDuration:
      FIXED_OPENING_MASTER.durationSeconds + scenes.reduce((sum, scene) => sum + scene.duration, 0),
    missingSceneCount: Math.max(0, input.totalSceneCount - scenes.length),
    scenes,
    subtitles,
    overlays,
    voiceAssignments: input.voiceAssignments ?? [],
    fixedOpening: {
      version: FIXED_OPENING_MASTER.version,
      duration: FIXED_OPENING_MASTER.durationSeconds,
      systemAsset: FIXED_OPENING_MASTER.file,
      sha256: FIXED_OPENING_MASTER.sha256,
      credits: 0,
    },
  };
}

export function narrationObjectKey(projectId: string, audioId: string) {
  return `projects/${projectId}/audio/narration/${audioId}.mp3`;
}

export function renderObjectKey(projectId: string, renderId: string) {
  return `projects/${projectId}/renders/${renderId}.mp4`;
}
