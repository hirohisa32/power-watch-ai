import { imageGenerationConfig } from "./config";

export function estimateOpenAiImageCost(input: {
  imageInputTokens: number;
  imageOutputTokens: number;
  textInputTokens: number;
}) {
  const config = imageGenerationConfig();
  return Number(
    (
      (input.imageInputTokens / 1_000_000) * config.imageInputUsdPerMillion +
      (input.imageOutputTokens / 1_000_000) * config.imageOutputUsdPerMillion +
      (input.textInputTokens / 1_000_000) * config.textInputUsdPerMillion
    ).toFixed(6),
  );
}
