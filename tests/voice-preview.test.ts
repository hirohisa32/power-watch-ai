import { describe, expect, it } from "vitest";
import {
  VOICE_PREVIEW_OPTIONS,
  VOICE_PREVIEW_TEXT,
  VOICE_PREVIEW_TESTS,
  voicePreviewInputSchema,
  voicePreviewObjectKey,
} from "@/lib/audio/voice-preview";

describe("Gold Khanjar voice preview", () => {
  it("allows only the two Human-approved Voice IDs", () => {
    for (const option of VOICE_PREVIEW_OPTIONS) {
      expect(
        voicePreviewInputSchema.parse({ voiceId: option.voiceId, testId: "test-1" }).voiceId,
      ).toBe(option.voiceId);
    }
    expect(() =>
      voicePreviewInputSchema.parse({ voiceId: "invented-voice", testId: "test-1" }),
    ).toThrow();
  });

  it("fixes the approved comparison text and deterministic R2 paths", () => {
    expect(VOICE_PREVIEW_TEXT).toBe(
      "1970年代、変革期のオマーン。金色のカンジャルは、国家から託された証でした。",
    );
    expect(VOICE_PREVIEW_TESTS.map((test) => test.text)).toEqual([
      "1970年代。",
      "変革期のオマーン。",
      "金色のカンジャルは、国家から託された証でした。",
    ]);
    expect(voicePreviewObjectKey(VOICE_PREVIEW_OPTIONS[0].voiceId, "test-1", "raw")).toBe(
      "system-assets/previews/gold-khanjar/voice-a/test-1/raw.mp3",
    );
    expect(voicePreviewObjectKey(VOICE_PREVIEW_OPTIONS[1].voiceId, "test-3", "normalized")).toBe(
      "system-assets/previews/gold-khanjar/voice-b/test-3/normalized.mp3",
    );
  });
});
