export function videoConfig() {
  return {
    cinematicModel: process.env.VIDEO_MODEL_CINEMATIC || "gen4.5",
    animationModel: process.env.VIDEO_MODEL_ANIMATION || "gen4.5",
    concurrency: boundedInt(process.env.VIDEO_GENERATION_CONCURRENCY, 2, 1, 3),
    maxRetries: boundedInt(process.env.VIDEO_JOB_MAX_RETRIES, 3, 1, 5),
    pollDelaySeconds: boundedInt(process.env.VIDEO_POLL_DELAY_SECONDS, 7, 5, 60),
    downloadTimeoutMs: boundedInt(process.env.VIDEO_DOWNLOAD_TIMEOUT_MS, 60_000, 5_000, 300_000),
    downloadMaxBytes: boundedInt(
      process.env.VIDEO_DOWNLOAD_MAX_BYTES,
      200 * 1024 * 1024,
      1_000_000,
      500 * 1024 * 1024,
    ),
    creditCostUsd: numberOr(process.env.RUNWAY_CREDIT_COST_USD, 0.01),
  };
}

function boundedInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number.parseInt(raw || "", 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function numberOr(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function modelForStyle(style: "cinematic_real" | "animation") {
  const config = videoConfig();
  return style === "animation" ? config.animationModel : config.cinematicModel;
}
