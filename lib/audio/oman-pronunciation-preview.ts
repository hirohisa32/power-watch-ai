import { z } from "zod";
import { VOICE_PREVIEW_OPTIONS } from "./voice-preview";

function item(id: string, label: string, displayScript: string, ttsInputText: string, kind: "reading" | "context") {
  return { id, label, displayScript, ttsInputText, kind, applied: [{ display: "オマーン", reading: ttsInputText, source: "pronunciation_test", kind }] };
}

export const OMAN_PRONUNCIATION_TESTS = [
  item("pattern-a", "A · カタカナ標準", "オマーン", "オマーン", "reading"),
  item("pattern-b", "B · ひらがな", "オマーン", "おまーん", "reading"),
  item("pattern-c", "C · 国を付加", "オマーン国", "オマーン国", "context"),
  item("pattern-d", "D · 地域文脈", "中東のオマーン", "中東のオマーン", "context"),
  item("pattern-e", "E · 説明文脈", "オマーンという国", "オマーンという国", "context"),
  item("pattern-f", "F · 読点と語尾", "オマーン、です。", "オマーン、です。", "context"),
  item("test-1", "TEST 1 · 単語単体", "オマーン。", "オマーン。", "context"),
  item("test-2", "TEST 2 · 変革期", "変革期のオマーン。", "変革期のオマーン。", "context"),
  item("test-3", "TEST 3 · 中東", "中東のオマーン。", "中東のオマーン。", "context"),
  item("test-4", "TEST 4 · 国", "オマーンという国。", "オマーンという国。", "context"),
  item("test-5", "TEST 5 · 年代と変革期", "1970年代、変革期のオマーン。", "1970年代、変革期のオマーン。", "context"),
] as const;

export const omanPronunciationInputSchema = z.object({
  voiceId: z.enum([VOICE_PREVIEW_OPTIONS[0].voiceId, VOICE_PREVIEW_OPTIONS[1].voiceId]),
  testId: z.enum(OMAN_PRONUNCIATION_TESTS.map((test) => test.id) as [string, ...string[]]),
});

export function omanPronunciationTest(testId: string) {
  return OMAN_PRONUNCIATION_TESTS.find((test) => test.id === testId);
}

export function omanPronunciationObjectKey(voiceId: string, testId: string, variant: "raw" | "normalized") {
  const option = VOICE_PREVIEW_OPTIONS.find((candidate) => candidate.voiceId === voiceId);
  const test = omanPronunciationTest(testId);
  if (!option || !test) throw new Error("OMAN_PRONUNCIATION_PREVIEW_NOT_ALLOWED");
  return `system-assets/previews/oman-pronunciation/v1/${option.key}/${test.id}/${variant}.mp3`;
}
