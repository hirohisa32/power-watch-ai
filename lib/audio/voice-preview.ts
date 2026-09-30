import { z } from "zod";
import {
  applyJapaneseReadingDictionary,
  SYSTEM_JAPANESE_READING_DICTIONARY,
  type JapaneseReadingEntry,
} from "./japanese-reading";

export type ReadingMapEntry = JapaneseReadingEntry;

export const GOLD_KHANJAR_READING_MAP: readonly ReadingMapEntry[] = [
  ...SYSTEM_JAPANESE_READING_DICTIONARY,
  { display: "オマーン", reading: "オマーン", source: "project" },
] as const;

export function applyGoldKhanjarReadingMap(displayScript: string) {
  return applyJapaneseReadingDictionary(displayScript, GOLD_KHANJAR_READING_MAP);
}

function previewTest(id: string, label: string, displayScript: string) {
  const reading = applyGoldKhanjarReadingMap(displayScript);
  return { id, label, displayScript, ...reading };
}

export const VOICE_PREVIEW_TEXT =
  "1970年代、変革期のオマーン。金色のカンジャルは、国家から託された証でした。";

export const VOICE_PREVIEW_TESTS = [
  previewTest("test-1", "TEST 1 · 数字", "1970年代。"),
  previewTest("test-2", "TEST 2 · 固有名詞", "変革期のオマーン。"),
  previewTest("test-3", "TEST 3 · 文末イントネーション", "金色のカンジャルは、国家から託された証でした。"),
  previewTest("test-4", "TEST 4 · 全体イントネーション", VOICE_PREVIEW_TEXT),
] as const;

export const VOICE_PREVIEW_OPTIONS = [
  { label: "Voice A", voiceId: "Bj4Malc5SZLoXfPtxRxH", key: "voice-a" },
  { label: "Voice B", voiceId: "hV5AJXCCNGT56GPYPLiG", key: "voice-b" },
] as const;

export const voicePreviewInputSchema = z.object({
  voiceId: z.enum([VOICE_PREVIEW_OPTIONS[0].voiceId, VOICE_PREVIEW_OPTIONS[1].voiceId]),
  testId: z.enum([VOICE_PREVIEW_TESTS[0].id, VOICE_PREVIEW_TESTS[1].id, VOICE_PREVIEW_TESTS[2].id, VOICE_PREVIEW_TESTS[3].id]),
});

export function voicePreviewOption(voiceId: string) {
  return VOICE_PREVIEW_OPTIONS.find((option) => option.voiceId === voiceId);
}

export function voicePreviewObjectKey(voiceId: string, testId: string, variant: "raw" | "normalized") {
  const option = voicePreviewOption(voiceId);
  if (!option) throw new Error("VOICE_PREVIEW_NOT_ALLOWED");
  const test = VOICE_PREVIEW_TESTS.find((item) => item.id === testId);
  if (!test) throw new Error("VOICE_PREVIEW_TEST_NOT_ALLOWED");
  return `system-assets/previews/gold-khanjar/reading-v2-no-spaces/${option.key}/${test.id}/${variant}.mp3`;
}

export function voicePreviewTest(testId: string) {
  return VOICE_PREVIEW_TESTS.find((item) => item.id === testId);
}
