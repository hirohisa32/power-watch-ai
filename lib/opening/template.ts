import path from "node:path";

export const OPENING_MASTER_KEY = "POWER_WATCH_OPENING_MASTER";
export const OPENING_MASTER_VERSION = 2;

export const OPENING_MASTER_METADATA = {
  totalDurationSeconds: 15.041,
  width: 1080,
  height: 1920,
  fps: 24,
  watchRevealStartSeconds: 9.25,
  watchRevealEndSeconds: 14.58,
  blackoutStartSeconds: 14.58,
  blackoutEndSeconds: 15.041,
  audioReusePolicy: "fixed-master-only",
  replacementRegion: { centerX: 0.5, centerY: 0.5, initialWidth: 220, finalWidth: 1320 },
} as const;

export const WATCH_REVEAL_TEMPLATE = {
  version: 1,
  source: "fixed-2.5d-composite",
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
  finalClickSeconds: 14.48,
  blackoutStartSeconds: OPENING_MASTER_METADATA.blackoutStartSeconds,
} as const;

export function openingMasterSystemPath(file: "video.mp4" | "audio-master.wav" | "opening-metadata.json" | "watch-reveal-template.json") {
  return path.join(process.cwd(), "opening-master", file);
}

export function openingMasterObjectKey(file: "video.mp4" | "audio-master.wav" | "opening-metadata.json" | "watch-reveal-template.json") {
  return `opening-master/${file}`;
}

export function openingWatchObjectKey(projectId: string, previewId: string) {
  return `projects/${projectId}/opening-previews/${previewId}/watch-cutout.png`;
}

export function openingPreviewObjectKey(projectId: string, previewId: string) {
  return `projects/${projectId}/opening-previews/${previewId}.mp4`;
}
