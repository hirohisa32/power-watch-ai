import { z } from "zod";

export const VOICE_PREVIEW_TEXT =
  "1970年代、変革期のオマーン。金色のカンジャルは、国家から託された証でした。";

export const VOICE_PREVIEW_OPTIONS = [
  { label: "Voice A", voiceId: "Bj4Malc5SZLoXfPtxRxH", key: "voice-a" },
  { label: "Voice B", voiceId: "hV5AJXCCNGT56GPYPLiG", key: "voice-b" },
] as const;

export const voicePreviewInputSchema = z.object({
  voiceId: z.enum([VOICE_PREVIEW_OPTIONS[0].voiceId, VOICE_PREVIEW_OPTIONS[1].voiceId]),
});

export function voicePreviewOption(voiceId: string) {
  return VOICE_PREVIEW_OPTIONS.find((option) => option.voiceId === voiceId);
}

export function voicePreviewObjectKey(voiceId: string) {
  const option = voicePreviewOption(voiceId);
  if (!option) throw new Error("VOICE_PREVIEW_NOT_ALLOWED");
  return `system-assets/previews/gold-khanjar/${option.key}.mp3`;
}
