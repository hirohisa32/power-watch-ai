import { describe, expect, it } from "vitest";
import {
  VOICE_PREVIEW_OPTIONS,
  VOICE_PREVIEW_TEXT,
  voicePreviewInputSchema,
  voicePreviewObjectKey,
} from "@/lib/audio/voice-preview";

describe("Gold Khanjar voice preview", () => {
  it("allows only the two Human-approved Voice IDs", () => {
    for (const option of VOICE_PREVIEW_OPTIONS) {
      expect(voicePreviewInputSchema.parse({ voiceId: option.voiceId }).voiceId).toBe(
        option.voiceId,
      );
    }
    expect(() => voicePreviewInputSchema.parse({ voiceId: "invented-voice" })).toThrow();
  });

  it("fixes the approved comparison text and deterministic R2 paths", () => {
    expect(VOICE_PREVIEW_TEXT).toBe(
      "1970年代、変革期のオマーン。金色のカンジャルは、国家から託された証でした。",
    );
    expect(voicePreviewObjectKey(VOICE_PREVIEW_OPTIONS[0].voiceId)).toBe(
      "system-assets/previews/gold-khanjar/voice-a.mp3",
    );
    expect(voicePreviewObjectKey(VOICE_PREVIEW_OPTIONS[1].voiceId)).toBe(
      "system-assets/previews/gold-khanjar/voice-b.mp3",
    );
  });
});
