import { z } from "zod";

export const VOICE_PREVIEW_TEXT =
  "1970年代、変革期のオマーン。金色のカンジャルは、国家から託された証でした。";

export const VOICE_PREVIEW_TESTS = [
  { id: "test-1", label: "TEST 1 · 数字", text: "1970年代。" },
  { id: "test-2", label: "TEST 2 · 固有名詞", text: "変革期のオマーン。" },
  {
    id: "test-3",
    label: "TEST 3 · 文末イントネーション",
    text: "金色のカンジャルは、国家から託された証でした。",
  },
] as const;

export const VOICE_PREVIEW_OPTIONS = [
  { label: "Voice A", voiceId: "Bj4Malc5SZLoXfPtxRxH", key: "voice-a" },
  { label: "Voice B", voiceId: "hV5AJXCCNGT56GPYPLiG", key: "voice-b" },
] as const;

export const voicePreviewInputSchema = z.object({
  voiceId: z.enum([VOICE_PREVIEW_OPTIONS[0].voiceId, VOICE_PREVIEW_OPTIONS[1].voiceId]),
  testId: z.enum([VOICE_PREVIEW_TESTS[0].id, VOICE_PREVIEW_TESTS[1].id, VOICE_PREVIEW_TESTS[2].id]),
});

export function voicePreviewOption(voiceId: string) {
  return VOICE_PREVIEW_OPTIONS.find((option) => option.voiceId === voiceId);
}

export function voicePreviewObjectKey(
  voiceId: string,
  testId: string,
  variant: "raw" | "normalized",
) {
  const option = voicePreviewOption(voiceId);
  if (!option) throw new Error("VOICE_PREVIEW_NOT_ALLOWED");
  const test = VOICE_PREVIEW_TESTS.find((item) => item.id === testId);
  if (!test) throw new Error("VOICE_PREVIEW_TEST_NOT_ALLOWED");
  return `system-assets/previews/gold-khanjar/${option.key}/${test.id}/${variant}.mp3`;
}

export function voicePreviewTest(testId: string) {
  return VOICE_PREVIEW_TESTS.find((item) => item.id === testId);
}
