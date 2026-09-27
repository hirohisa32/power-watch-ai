import { buildSubtitleCues } from "@/lib/audio/timing";
import type { FinalRenderInput, RenderScene, TextOverlay } from "./types";

export const SOUND_EFFECT_BY_PRESET: Record<string, { key: string; frequency: number }> = {
  Opening: { key: "clock-tick", frequency: 880 },
  VintageRoom: { key: "door", frequency: 196 },
  OldBook: { key: "book", frequency: 330 },
  WatchReveal: { key: "watch-mechanical", frequency: 1040 },
  HistoricalCharacter: { key: "dust", frequency: 240 },
  HistoricalEvent: { key: "crowd", frequency: 180 },
  Racing: { key: "race", frequency: 120 },
  CityEraEstablishing: { key: "wind", frequency: 260 },
  WristShot: { key: "clock-tick", frequency: 920 },
  WatchMacro: { key: "watch-mechanical", frequency: 1100 },
  ProductHero: { key: "transition", frequency: 660 },
  YearLocationTitle: { key: "transition", frequency: 520 },
  Ending: { key: "clock-tick", frequency: 780 },
};

export function buildFinalRenderInput(input: {
  language: "ja" | "en" | "zh";
  bgmKey: string;
  scenes: RenderScene[];
  totalSceneCount: number;
}): FinalRenderInput {
  const scenes = [...input.scenes].sort((a, b) => a.order - b.order);
  if (!scenes.length) throw new Error("MISSING_SCENE_VIDEO");
  const subtitles = buildSubtitleCues(
    scenes.map((scene) => ({
      id: scene.sceneId,
      duration: scene.duration,
      narration: scene.narration,
      subtitle: scene.subtitle,
    })),
  );
  const overlays: TextOverlay[] = [];
  let cursorMs = 0;
  scenes.forEach((scene, index) => {
    const durationMs = scene.duration * 1000;
    if (index === 0)
      overlays.push({
        kind: "brand",
        startMs: cursorMs,
        endMs: Math.min(cursorMs + 2200, cursorMs + durationMs),
        primary: "POWER WATCH",
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
    fps: 30,
    language: input.language,
    bgmKey: input.bgmKey,
    totalDuration: scenes.reduce((sum, scene) => sum + scene.duration, 0),
    missingSceneCount: Math.max(0, input.totalSceneCount - scenes.length),
    scenes,
    subtitles,
    overlays,
  };
}

export function narrationObjectKey(projectId: string, audioId: string) {
  return `projects/${projectId}/audio/narration/${audioId}.mp3`;
}

export function renderObjectKey(projectId: string, renderId: string) {
  return `projects/${projectId}/renders/${renderId}.mp4`;
}
