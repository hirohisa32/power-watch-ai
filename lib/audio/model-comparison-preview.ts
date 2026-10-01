import { z } from "zod";
import { VOICE_PREVIEW_OPTIONS } from "./voice-preview";

export const MODEL_COMPARISON_TEXT = `1970年代、変革期を迎えていたオマーン。
国に尽くした者へ、特別な贈り物が用意されました。
英国との結びつきの中、その仕立てを担ったのはロンドンの名門アスプレイ。
選ばれたのは、ロレックス・シードゥエラー、1665。
黒い文字盤に輝く金色のカンジャルは、国家から託された証です。`;

export const MODEL_COMPARISON_MODELS = ["eleven_multilingual_v2", "eleven_v4"] as const;

export const MODEL_COMPARISON_OPTIONS = VOICE_PREVIEW_OPTIONS.flatMap((voice) =>
  MODEL_COMPARISON_MODELS.map((model) => ({
    id: `${voice.key}:${model}`,
    label: `${voice.label} / ${model === "eleven_v4" ? "v4" : "v2"}`,
    voiceId: voice.voiceId,
    voiceKey: voice.key,
    model,
    modelKey: model === "eleven_v4" ? "v4" : "v2",
  })),
);

export const modelComparisonInputSchema = z.object({
  voiceId: z.enum([VOICE_PREVIEW_OPTIONS[0].voiceId, VOICE_PREVIEW_OPTIONS[1].voiceId]),
  model: z.enum(MODEL_COMPARISON_MODELS),
});

export function modelComparisonOption(voiceId: string, model: string) {
  return MODEL_COMPARISON_OPTIONS.find((option) => option.voiceId === voiceId && option.model === model);
}

export function modelComparisonObjectKey(voiceId: string, model: string, variant: "raw" | "normalized") {
  const option = modelComparisonOption(voiceId, model);
  if (!option) throw new Error("MODEL_COMPARISON_NOT_ALLOWED");
  return `system-assets/previews/elevenlabs-model-comparison/v1/${option.voiceKey}/${option.modelKey}/${variant}.mp3`;
}
