export function imageGenerationConfig() {
  return {
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst",
    size: process.env.OPENAI_IMAGE_SIZE || "1024x1536",
    quality: (process.env.OPENAI_IMAGE_QUALITY || "high") as "low" | "medium" | "high",
    textInputUsdPerMillion: positiveNumber(process.env.OPENAI_IMAGE_TEXT_INPUT_USD_PER_MILLION, 5),
    imageInputUsdPerMillion: positiveNumber(process.env.OPENAI_IMAGE_INPUT_USD_PER_MILLION, 8),
    imageOutputUsdPerMillion: positiveNumber(process.env.OPENAI_IMAGE_OUTPUT_USD_PER_MILLION, 30),
  };
}

export function supportsInputFidelity(model: string) {
  return model.startsWith("gpt-image-1");
}

function positiveNumber(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
