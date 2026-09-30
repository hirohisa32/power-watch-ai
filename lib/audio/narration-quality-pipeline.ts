import type { NarrationSegmentPlan, NarrationQualityScores, NarrationQualityStatus } from "./narration-quality";
import { classifyNarrationQuality, inspectRecognizedSpeech, retryAdjustment } from "./narration-quality";

export type GeneratedQualityAudio = { bytes: Uint8Array; durationSeconds: number; units: number };
export type NaturalnessAssessment = { scores: NarrationQualityScores; confidence: number; reasons: string[] };
export type QualitySegmentResult = {
  plan: NarrationSegmentPlan;
  status: NarrationQualityStatus;
  retryCount: number;
  recognizedSpeech: string;
  scores: NarrationQualityScores;
  confidence: number;
  reasons: string[];
  audio: GeneratedQualityAudio;
};

export type NarrationQualityDependencies = {
  synthesize(plan: NarrationSegmentPlan, attempt: number): Promise<GeneratedQualityAudio>;
  transcribe(audio: Uint8Array, language: "ja"): Promise<string>;
  assessNaturalness(input: { audio: Uint8Array; displayScript: string; expectedReading: string }): Promise<NaturalnessAssessment>;
};

export async function runNarrationSegmentQualityGate(plan: NarrationSegmentPlan, dependencies: NarrationQualityDependencies): Promise<QualitySegmentResult> {
  let current = plan;
  for (let retryCount = 0; retryCount <= 2; retryCount += 1) {
    const audio = await dependencies.synthesize(current, retryCount);
    const [recognizedSpeech, naturalness] = await Promise.all([
      dependencies.transcribe(audio.bytes, "ja"),
      dependencies.assessNaturalness({ audio: audio.bytes, displayScript: current.displayScript, expectedReading: current.expectedReading }),
    ]);
    const transcript = inspectRecognizedSpeech(current.expectedReading, recognizedSpeech);
    const decision = classifyNarrationQuality({ transcript, scores: naturalness.scores, confidence: naturalness.confidence, retryCount, reasons: naturalness.reasons });
    if (decision.status !== "RETRY") return { plan: current, status: decision.status, retryCount, recognizedSpeech, scores: naturalness.scores, confidence: naturalness.confidence, reasons: decision.reasons, audio };
    const adjustment = retryAdjustment(decision.reasons);
    current = {
      ...current,
      // displayScript is immutable. A provider may use the attempt and these safe punctuation hints,
      // but may never summarize or paraphrase the viewer-facing script.
      ttsInputText: adjustment.adjustPunctuation ? normalizeJapanesePauses(current.ttsInputText) : current.ttsInputText,
      expectedReading: adjustment.adjustPunctuation ? normalizeJapanesePauses(current.expectedReading) : current.expectedReading,
    };
  }
  throw new Error("NARRATION_QUALITY_RETRY_LOOP_BROKEN");
}

function normalizeJapanesePauses(value: string) {
  return value.replace(/、{2,}/g, "、").replace(/。{2,}/g, "。").trim();
}
