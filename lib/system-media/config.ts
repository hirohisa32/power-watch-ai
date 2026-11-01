export const HAYASHI_VOICE = {
  name: "Mr Kenji Hayashi",
  voiceId: "CeKhvpl894bEZDsRgdlL",
  model: "eleven_v4",
} as const;

export const SYSTEM_VIDEO_ASSET_IDS = {
  openingPowerWatch: "10000000-0000-4000-8000-000000000001",
  openingCoolVintageWatch: "10000000-0000-4000-8000-000000000002",
  openingTrustWatch: "10000000-0000-4000-8000-000000000003",
  endingPowerWatch: "10000000-0000-4000-8000-000000000011",
  endingCoolVintageWatch: "10000000-0000-4000-8000-000000000012",
  endingTrustWatch: "10000000-0000-4000-8000-000000000013",
} as const;

export type SystemVideoAssetKind = "opening" | "ending";

export const DEFAULT_SYSTEM_VIDEO_ASSET_ID = {
  opening: SYSTEM_VIDEO_ASSET_IDS.openingPowerWatch,
  ending: SYSTEM_VIDEO_ASSET_IDS.endingPowerWatch,
} as const;
