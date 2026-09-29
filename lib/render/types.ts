import type { SubtitleCue } from "@/lib/audio/timing";
import type { DialogueLine, VoiceAssignment } from "@/lib/audio/voices";

export type RenderScene = {
  sceneId: string;
  generationId: string;
  order: number;
  preset: string;
  transition?: string;
  duration: number;
  narration: string;
  narrationTone?: string;
  dialogue?: DialogueLine[];
  subtitle: string;
  year: string | null;
  location: string | null;
  objectKey: string;
};

export type TextOverlay = {
  kind: "brand" | "year-location";
  startMs: number;
  endMs: number;
  primary: string;
  secondary?: string;
};

export type FinalRenderInput = {
  width: 1080;
  height: 1920;
  fps: 24;
  language: "ja" | "en" | "zh";
  bgmKey: string;
  totalDuration: number;
  missingSceneCount: number;
  scenes: RenderScene[];
  subtitles: SubtitleCue[];
  overlays: TextOverlay[];
  voiceAssignments: VoiceAssignment[];
  fixedOpening: {
    version: number;
    duration: number;
    systemAsset: string;
    sha256: string;
    credits: 0;
  };
};
