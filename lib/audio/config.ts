export function narrationConfig() {
  return {
    apiKey: process.env.ELEVENLABS_API_KEY,
    defaultVoiceId: process.env.ELEVENLABS_DEFAULT_VOICE_ID || process.env.ELEVENLABS_VOICE_ID,
    model: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
    pricePerThousandCharacters: positiveNumber(process.env.ELEVENLABS_PRICE_PER_1K_CHARACTERS, 0.1),
    timeoutMs: boundedInt(process.env.ELEVENLABS_TIMEOUT_MS, 90_000, 5_000, 180_000),
  };
}

function positiveNumber(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function boundedInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number.parseInt(raw || "", 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
