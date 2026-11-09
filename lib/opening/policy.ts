export const FIXED_OPENING_PRESETS = new Set(["Opening", "VintageRoom", "OldBook", "WatchReveal"]);

export function isFixedOpeningPreset(preset: string) {
  return FIXED_OPENING_PRESETS.has(preset);
}

/**
 * Legacy storyboards stored the generated opening as scenes without a story phase.
 * Current storyboards always have a story phase and use an external System Asset,
 * so a body scene must not be excluded merely because its visual preset is Opening.
 */
export function isFixedOpeningScene(scene: { preset: string; storyPhase?: string | null }) {
  return isFixedOpeningPreset(scene.preset) && !scene.storyPhase;
}
