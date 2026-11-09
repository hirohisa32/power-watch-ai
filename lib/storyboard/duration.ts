type SystemAssetDuration = {
  durationMs: number;
  recommendedStartMs?: number | null;
  recommendedEndMs?: number | null;
  recommendedDurationMs?: number | null;
};

export function effectiveSystemAssetDurationSeconds(asset: SystemAssetDuration | null) {
  if (!asset) return 0;
  const startMs = Math.max(0, asset.recommendedStartMs ?? 0);
  const endMs = Math.min(asset.durationMs, asset.recommendedEndMs ?? asset.durationMs);
  const availableMs = Math.max(0, endMs - startMs);
  return Math.max(0, Math.min(asset.recommendedDurationMs ?? availableMs, availableMs)) / 1000;
}

/**
 * The duration selected in the wizard is the completed-video duration. Storyboard
 * scenes only occupy the body left after the approved opening and ending assets.
 */
export function calculateStoryBodyDuration(
  totalDuration: 60 | 90,
  opening: SystemAssetDuration | null,
  ending: SystemAssetDuration | null,
) {
  const systemMediaSeconds =
    effectiveSystemAssetDurationSeconds(opening) + effectiveSystemAssetDurationSeconds(ending);
  return Math.max(24, Math.round(totalDuration - systemMediaSeconds));
}
