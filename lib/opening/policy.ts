export const FIXED_OPENING_PRESETS = new Set(["Opening", "VintageRoom", "OldBook", "WatchReveal"]);

export function isFixedOpeningPreset(preset: string) {
  return FIXED_OPENING_PRESETS.has(preset);
}
