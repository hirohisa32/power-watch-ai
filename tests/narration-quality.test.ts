import { describe, expect, it } from "vitest";
import { SYSTEM_JAPANESE_READING_DICTIONARY } from "@/lib/audio/japanese-reading";
import { classifyNarrationQuality, inspectRecognizedSpeech, retryAdjustment, splitJapaneseNarration, verifyNarrationAssembly } from "@/lib/audio/narration-quality";

const passingScores = { pronunciationAccuracy: 95, naturalness: 90, prosody: 88, pause: 90, sentenceEnding: 92, properNouns: 94, luxuryNarrationFit: 86 };

describe("Japanese narration quality gate", () => {
  it("uses unmodified natural Japanese in the v4 standard path", () => {
    const segments = splitJapaneseNarration("1970年代、変革期。国家の物語です。Rolexが選ばれました。", SYSTEM_JAPANESE_READING_DICTIONARY);
    expect(segments).toHaveLength(2);
    expect(segments[0].ttsInputText).toBe("1970年代、変革期。国家の物語です。");
    expect(segments[0].ttsInputText).toBe(segments[0].displayScript);
    expect(segments[0].readingMap).toEqual([]);
    expect(segments[1].ttsInputText).toBe("Rolexが選ばれました。");
  });

  it("applies the pronunciation dictionary only when explicitly selected as fallback", () => {
    const [segment] = splitJapaneseNarration("1970年代、変革期。", SYSTEM_JAPANESE_READING_DICTIONARY, 2, 90, [], "pronunciation_dictionary");
    expect(segment.ttsInputText).toBe("せんきゅうひゃくななじゅうねんだい、へんかくき。");
    expect(segment.readingMap).toHaveLength(2);
  });

  it("passes accurate speech with strong naturalness scores", () => {
    const transcript = inspectRecognizedSpeech("へんかくきのオマーン。", "へんかくきのオマーン。");
    expect(classifyNarrationQuality({ transcript, scores: passingScores, confidence: 0.94, retryCount: 0 })).toEqual({ status: "PASS", reasons: [] });
  });

  it("retries only the failed segment and stops after two retries", () => {
    const transcript = inspectRecognizedSpeech("こっかから託された証でした。", "こかから託された証でした。");
    expect(classifyNarrationQuality({ transcript, scores: passingScores, confidence: 0.9, retryCount: 0 }).status).toBe("RETRY");
    expect(classifyNarrationQuality({ transcript, scores: passingScores, confidence: 0.9, retryCount: 2 }).status).toBe("HUMAN_REVIEW");
    expect(retryAdjustment(["固有名詞発音"]).applyDictionary).toBe(true);
  });

  it("requires human review when the AI judgement confidence is low", () => {
    const transcript = inspectRecognizedSpeech("証でした。", "証でした。");
    expect(classifyNarrationQuality({ transcript, scores: passingScores, confidence: 0.5, retryCount: 0 }).status).toBe("HUMAN_REVIEW");
  });

  it("assembles only complete ordered PASS segments", () => {
    expect(verifyNarrationAssembly([
      { index: 0, status: "PASS", displayScript: "第一文。" },
      { index: 1, status: "PASS", displayScript: "第二文。" },
    ], "第一文。第二文。")).toEqual({ allPassed: true, orderCorrect: true, complete: true });
  });
});
