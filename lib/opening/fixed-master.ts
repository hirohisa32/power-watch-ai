import path from "node:path";
export { FIXED_OPENING_PRESETS, isFixedOpeningPreset } from "./policy";

export const FIXED_OPENING_MASTER = {
  version: 4,
  file: "assets/opening/opening-master.mp4",
  sha256: "c972b57260291055e9f906a2b84d69e24d4198304da82ed9df951c0ee5bed7ee",
  durationSeconds: 15.07,
  width: 1080,
  height: 1920,
  fps: 24,
  videoCodec: "hevc-main10",
  audioCodec: "aac-lc",
  audioSampleRate: 32000,
  openingCredits: 0,
  replacementEnabled: false,
  generationEnabled: false,
} as const;

export function fixedOpeningMasterPath() {
  return path.join(process.cwd(), FIXED_OPENING_MASTER.file);
}
