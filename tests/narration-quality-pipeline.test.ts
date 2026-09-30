import { describe, expect, it, vi } from "vitest";
import { runNarrationSegmentQualityGate } from "@/lib/audio/narration-quality-pipeline";

const scores = { pronunciationAccuracy: 96, naturalness: 90, prosody: 90, pause: 90, sentenceEnding: 90, properNouns: 90, luxuryNarrationFit: 90 };
const plan = { index: 0, displayScript: "変革期のオマーン。", ttsInputText: "へんかくきのオマーン。", expectedReading: "へんかくきのオマーン。", readingMap: [] };

describe("narration quality pipeline", () => {
  it("retries only a failed segment and returns its accepted generation", async () => {
    const synthesize = vi.fn(async () => ({ bytes: new Uint8Array([1]), durationSeconds: 2, units: 10 }));
    const transcribe = vi.fn().mockResolvedValueOnce("へんがくきのオマーン。").mockResolvedValueOnce("へんかくきのオマーン。");
    const result = await runNarrationSegmentQualityGate(plan, { synthesize, transcribe, assessNaturalness: async () => ({ scores, confidence: 0.95, reasons: [] }) });
    expect(result.status).toBe("PASS");
    expect(result.retryCount).toBe(1);
    expect(synthesize).toHaveBeenCalledTimes(2);
  });

  it("moves uncertain AI assessments directly to human review", async () => {
    const result = await runNarrationSegmentQualityGate(plan, {
      synthesize: async () => ({ bytes: new Uint8Array([1]), durationSeconds: 2, units: 10 }),
      transcribe: async () => "へんかくきのオマーン。",
      assessNaturalness: async () => ({ scores, confidence: 0.4, reasons: [] }),
    });
    expect(result.status).toBe("HUMAN_REVIEW");
    expect(result.retryCount).toBe(0);
  });
});
