import { describe, expect, it } from "vitest";
import { OMAN_PRONUNCIATION_TESTS, omanPronunciationObjectKey } from "@/lib/audio/oman-pronunciation-preview";
import { VOICE_PREVIEW_OPTIONS } from "@/lib/audio/voice-preview";

describe("Oman pronunciation preview", () => {
  it("contains six pronunciation patterns and five context tests without artificial spaces", () => {
    expect(OMAN_PRONUNCIATION_TESTS).toHaveLength(11);
    expect(OMAN_PRONUNCIATION_TESTS.map((test) => test.ttsInputText)).toEqual([
      "オマーン", "おまーん", "オマーン国", "中東のオマーン", "オマーンという国", "オマーン、です。",
      "オマーン。", "変革期のオマーン。", "中東のオマーン。", "オマーンという国。", "1970年代、変革期のオマーン。",
    ]);
    expect(OMAN_PRONUNCIATION_TESTS.every((test) => !test.ttsInputText.includes(" "))).toBe(true);
  });

  it("uses an isolated R2 path", () => {
    expect(omanPronunciationObjectKey(VOICE_PREVIEW_OPTIONS[0].voiceId, "pattern-a", "normalized")).toBe("system-assets/previews/oman-pronunciation/v1/voice-a/pattern-a/normalized.mp3");
  });
});
