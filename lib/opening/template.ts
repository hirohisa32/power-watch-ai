import path from "node:path";

export const OPENING_MASTER_KEY = "POWER_WATCH_OPENING_MASTER";
export const OPENING_MASTER_VERSION = 3;

export const OPENING_MASTER_METADATA = {
  totalDurationSeconds: 15.041,
  width: 1080,
  height: 1920,
  fps: 24,
  watchRevealStartSeconds: 9.25,
  watchRevealEndSeconds: 14.58,
  blackoutStartSeconds: 14.58,
  blackoutEndSeconds: 15.041,
  audioReusePolicy: "fixed-original-audio-natural-tail-no-added-click",
  replacementRegion: { centerX: 0.5, centerY: 0.5, initialWidth: 220, finalWidth: 1320 },
} as const;

export const WATCH_REVEAL_TEMPLATE = {
  version: 3,
  source: "watchless-master-multi-angle-tracked-composite",
  preserveMasterBeforeSeconds: OPENING_MASTER_METADATA.watchRevealStartSeconds,
  transform: {
    startSeconds: OPENING_MASTER_METADATA.watchRevealStartSeconds,
    endSeconds: OPENING_MASTER_METADATA.watchRevealEndSeconds,
    initialWidth: 220,
    finalWidth: 1320,
    liftPixels: 280,
    startRotationRadians: -0.1,
    endRotationRadians: 0,
    shadowOpacity: 0.42,
  },
  finalClickSeconds: null,
  blackoutStartSeconds: OPENING_MASTER_METADATA.blackoutStartSeconds,
} as const;

export type OpeningMasterFile =
  | "video.mp4"
  | "watchless-master.mp4"
  | "audio-master.wav"
  | "audio-master-v3.wav"
  | "opening-metadata.json"
  | "watch-reveal-template.json"
  | "original-watch-motion-track.json"
  | "foreground-occlusion-mask.json"
  | "watch-angle-map.json"
  | "lighting-shadow-preset.json";

export function openingMasterSystemPath(file: OpeningMasterFile) {
  return path.join(process.cwd(), "opening-master", file);
}

export function openingMasterObjectKey(file: OpeningMasterFile) {
  return `opening-master/${file}`;
}

export function openingWatchObjectKey(projectId: string, previewId: string) {
  return `projects/${projectId}/opening-previews/${previewId}/watch-cutout.png`;
}

export function openingPreviewObjectKey(projectId: string, previewId: string) {
  return `projects/${projectId}/opening-previews/${previewId}.mp4`;
}
