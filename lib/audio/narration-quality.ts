import type { JapaneseReadingEntry } from "./japanese-reading";
import { applyJapaneseReadingDictionary } from "./japanese-reading";
import { applyApprovedContextRules, type ContextPronunciationRule } from "./context-pronunciation";

export type NarrationQualityStatus = "PASS" | "RETRY" | "HUMAN_REVIEW";

export type NarrationQualityScores = {
  pronunciationAccuracy: number;
  naturalness: number;
  prosody: number;
  pause: number;
  sentenceEnding: number;
  properNouns: number;
  luxuryNarrationFit: number;
};

export type NarrationSegmentPlan = {
  index: number;
  displayScript: string;
  ttsInputText: string;
  expectedReading: string;
  readingMap: JapaneseReadingEntry[];
};

export type NarrationFallbackMode = "natural" | "pronunciation_dictionary" | "context_rule";

export type TranscriptInspection = {
  accuracy: number;
  missingEnding: boolean;
  repeatedContent: boolean;
  expectedNormalized: string;
  recognizedNormalized: string;
  reasons: string[];
};

const RETRYABLE_REASONS = new Set([
  "読み飛ばし・単語置換",
  "文末欠落",
  "重複",
  "固有名詞発音",
  "数字の読み",
  "Pause",
]);

export function splitJapaneseNarration(
  displayScript: string,
  dictionary: readonly JapaneseReadingEntry[] = [],
  maxSentences = 2,
  maxCharacters = 90,
  contextRules: readonly ContextPronunciationRule[] = [],
  fallbackMode: NarrationFallbackMode = "natural",
): NarrationSegmentPlan[] {
  const sentences = displayScript
    .match(/[^。！？!?]+[。！？!?]?/g)
    ?.map((value) => value.trim())
    .filter(Boolean) ?? [];
  const groups: string[] = [];
  let current = "";
  let sentenceCount = 0;
  for (const sentence of sentences) {
    const wouldOverflow = current && (sentenceCount >= maxSentences || current.length + sentence.length > maxCharacters);
    if (wouldOverflow) {
      groups.push(current);
      current = "";
      sentenceCount = 0;
    }
    current += sentence;
    sentenceCount += 1;
  }
  if (current) groups.push(current);
  return groups.map((segment, index) => {
    // v4の標準経路では自然文を一切書き換えない。辞書とContext Ruleは
    // Quality Gateで明確な誤読が検出された場合だけ、段階的に使用する。
    const context = fallbackMode === "context_rule"
      ? applyApprovedContextRules(segment, contextRules)
      : { ttsInputText: segment, applied: [] };
    const reading = fallbackMode === "pronunciation_dictionary"
      ? applyJapaneseReadingDictionary(segment, dictionary)
      : { ttsInputText: context.ttsInputText, applied: [] };
    return {
      index,
      displayScript: segment,
      ttsInputText: reading.ttsInputText,
      expectedReading: reading.ttsInputText,
      readingMap: [...context.applied.map((rule) => ({ display: rule.displayPattern, reading: rule.ttsTemplate, source: "human" as const })), ...reading.applied],
    };
  });
}

export function inspectRecognizedSpeech(expected: string, recognized: string): TranscriptInspection {
  const expectedNormalized = normalizeJapanese(expected);
  const recognizedNormalized = normalizeJapanese(recognized);
  const distance = levenshtein(expectedNormalized, recognizedNormalized);
  const accuracy = expectedNormalized.length
    ? Math.max(0, 1 - distance / expectedNormalized.length)
    : recognizedNormalized.length === 0
      ? 1
      : 0;
  const expectedEnding = expected.match(/[。！？!?]$/)?.[0] ?? "";
  const missingEnding = Boolean(expectedEnding) && !recognized.trim().endsWith(expectedEnding);
  const repeatedContent = hasRepeatedPhrase(recognizedNormalized);
  const reasons: string[] = [];
  if (accuracy < 0.96) reasons.push("読み飛ばし・単語置換");
  if (missingEnding) reasons.push("文末欠落");
  if (repeatedContent) reasons.push("重複");
  return { accuracy, missingEnding, repeatedContent, expectedNormalized, recognizedNormalized, reasons };
}

export function classifyNarrationQuality(input: {
  transcript: TranscriptInspection;
  scores: NarrationQualityScores;
  confidence: number;
  retryCount: number;
  reasons?: string[];
}): { status: NarrationQualityStatus; reasons: string[] } {
  const reasons = [...new Set([...input.transcript.reasons, ...(input.reasons ?? [])])];
  const lowScores = Object.entries(input.scores)
    .filter(([, score]) => score < 80)
    .map(([name]) => scoreLabel(name));
  reasons.push(...lowScores.filter((reason) => !reasons.includes(reason)));
  if (input.confidence < 0.7) return { status: "HUMAN_REVIEW", reasons: [...reasons, "判定信頼度不足"] };
  if (reasons.length === 0 && input.transcript.accuracy >= 0.96)
    return { status: "PASS", reasons: [] };
  if (input.retryCount < 2 && reasons.some((reason) => RETRYABLE_REASONS.has(reason)))
    return { status: "RETRY", reasons };
  return { status: "HUMAN_REVIEW", reasons };
}

export function retryAdjustment(reasons: readonly string[]) {
  const pronunciationIssue = reasons.some((reason) =>
    ["読み飛ばし・単語置換", "固有名詞発音", "数字の読み"].includes(reason),
  );
  return {
    applyDictionary: pronunciationIssue,
    allowContextRuleAfterDictionary: pronunciationIssue,
    adjustPunctuation: reasons.includes("Pause"),
    preserveDisplayScript: true,
    maxSpeedChangePercent: 3,
  };
}

export function verifyNarrationAssembly(segments: readonly { index: number; status: NarrationQualityStatus; displayScript: string }[], originalScript: string) {
  const ordered = [...segments].sort((a, b) => a.index - b.index);
  return {
    allPassed: ordered.length > 0 && ordered.every((segment) => segment.status === "PASS"),
    orderCorrect: ordered.every((segment, index) => segment.index === index),
    complete: normalizeJapanese(ordered.map((segment) => segment.displayScript).join("")) === normalizeJapanese(originalScript),
  };
}

function normalizeJapanese(value: string) {
  return value.normalize("NFKC").replace(/[\s、。！？!?・「」『』（）()]/g, "").toLocaleLowerCase("ja");
}

function hasRepeatedPhrase(value: string) {
  for (let size = 4; size <= Math.min(14, Math.floor(value.length / 2)); size += 1) {
    for (let start = 0; start + size * 2 <= value.length; start += 1) {
      if (value.slice(start, start + size) === value.slice(start + size, start + size * 2)) return true;
    }
  }
  return false;
}

function levenshtein(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const previous = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = previous;
    }
  }
  return row[b.length];
}

function scoreLabel(name: string) {
  return ({
    pronunciationAccuracy: "発音精度",
    naturalness: "自然さ",
    prosody: "イントネーション",
    pause: "Pause",
    sentenceEnding: "語尾",
    properNouns: "固有名詞発音",
    luxuryNarrationFit: "高級ドキュメンタリー適合",
  } as Record<string, string>)[name] ?? name;
}
