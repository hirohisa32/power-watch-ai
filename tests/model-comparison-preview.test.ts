import { describe, expect, it } from "vitest";
import { MODEL_COMPARISON_OPTIONS, MODEL_COMPARISON_TEXT, modelComparisonObjectKey } from "@/lib/audio/model-comparison-preview";

describe("ElevenLabs model comparison preview", () => {
  it("contains exactly four voice/model combinations", () => {
    expect(MODEL_COMPARISON_OPTIONS.map((item) => item.label)).toEqual(["Voice A / v2", "Voice A / v4", "Voice B / v2", "Voice B / v4"]);
  });

  it("keeps display and TTS text identical without pronunciation transforms", () => {
    expect(MODEL_COMPARISON_TEXT).toContain("ロレックス・シードゥエラー、1665。");
    expect(modelComparisonObjectKey(MODEL_COMPARISON_OPTIONS[1].voiceId, "eleven_v4", "normalized")).toBe("system-assets/previews/elevenlabs-model-comparison/v1/voice-a/v4/normalized.mp3");
  });
});
