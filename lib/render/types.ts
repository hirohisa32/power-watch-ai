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
  narrationSegmentId?: string | null;
  narrationTone?: string;
  dialogue?: DialogueLine[];
  subtitle: string;
  visualIntent?: string | null;
  visualSubject?: string | null;
  historicalPeriod?: string | null;
  characterId?: string | null;
  productPhotoId?: string | null;
  productPhotoRole?: string | null;
  visualType?: string | null;
  visualRelevanceScore?: number | null;
  visualRelevanceStatus?: string | null;
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

export type RenderSystemAsset = {
  id: string;
  key: string;
  storagePath: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  recommendedStart?: number;
  recommendedEnd?: number;
  recommendedDuration?: number;
};

export type FinalRenderInput = {
  width: 1080;
  height: 1920;
  fps: 30;
  language: "ja" | "en" | "zh";
  bgmKey: string;
  totalDuration: number;
  missingSceneCount: number;
  scenes: RenderScene[];
  subtitles: SubtitleCue[];
  overlays: TextOverlay[];
  voiceAssignments: VoiceAssignment[];
  openingAsset: RenderSystemAsset | null;
  endingAsset: RenderSystemAsset | null;
  alignment?: import("@/lib/audio/timing").NarrationAlignmentData | null;
};
