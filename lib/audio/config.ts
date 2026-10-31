import { HAYASHI_VOICE } from "@/lib/system-media/config";

export function narrationConfig() {
  return {
    apiKey: process.env.ELEVENLABS_API_KEY,
    // Production narration is intentionally immutable. If this voice is unavailable,
    // the render must safe-stop instead of silently changing the client's brand voice.
    defaultVoiceId: HAYASHI_VOICE.voiceId,
    model: HAYASHI_VOICE.model,
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
