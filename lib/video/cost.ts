const RUNWAY_CREDITS_PER_SECOND: Record<string, number> = {
  "gen4.5": 12,
  gen4_turbo: 5,
};

export function estimateVideoCost(model: string, duration: number, creditCostUsd = 0.01) {
  const creditsPerSecond = RUNWAY_CREDITS_PER_SECOND[model];
  if (!creditsPerSecond) return { credits: null, usd: null };
  const credits = creditsPerSecond * duration;
  return { credits, usd: Number((credits * creditCostUsd).toFixed(4)) };
}

export function creditsToUsd(credits: number | undefined, creditCostUsd = 0.01) {
  return credits === undefined ? undefined : Number((credits * creditCostUsd).toFixed(4));
}
