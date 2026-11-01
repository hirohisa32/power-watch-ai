import "server-only";
import OpenAI, { toFile } from "openai";
import { imageGenerationConfig, supportsInputFidelity } from "./config";
import {
  ImageGenerationProviderError,
  type ImageGenerationInput,
  type ImageGenerationProvider,
  type ImageGenerationResult,
} from "./types";

export class OpenAIImageGenerationProvider implements ImageGenerationProvider {
  readonly name = "openai";
  readonly model = imageGenerationConfig().model;

  async generate(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    if (!process.env.OPENAI_API_KEY)
      throw new ImageGenerationProviderError("OPENAI_API_KEYが設定されていません", "NOT_CONFIGURED");
    const config = imageGenerationConfig();
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
    try {
      const common = {
        model: config.model,
        prompt: input.prompt,
        n: 1,
        size: config.size,
        quality: config.quality,
        output_format: "jpeg" as const,
        output_compression: 92,
      };
      const promise = input.references?.length
        ? client.images.edit({
            ...common,
            ...(supportsInputFidelity(config.model) ? { input_fidelity: "high" as const } : {}),
            image: await Promise.all(input.references.map((reference) => toFile(reference.bytes, reference.name, { type: reference.mimeType }))),
          })
        : client.images.generate(common);
      const { data: response, request_id: requestId } = await promise.withResponse();
      const encoded = response.data?.[0]?.b64_json;
      if (!encoded) throw new ImageGenerationProviderError("画像データが返されませんでした", "NO_IMAGE");
      const usage = response.usage;
      return {
        bytes: new Uint8Array(Buffer.from(encoded, "base64")),
        mimeType: "image/jpeg",
        model: config.model,
        requestId: requestId ?? null,
        imageInputTokens: usage?.input_tokens_details?.image_tokens ?? 0,
        imageOutputTokens: usage?.output_tokens_details?.image_tokens ?? usage?.output_tokens ?? 0,
        textInputTokens: usage?.input_tokens_details?.text_tokens ?? usage?.input_tokens ?? 0,
      };
    } catch (error) {
      if (error instanceof ImageGenerationProviderError) throw error;
      if (error instanceof OpenAI.APIError) {
        const code = error.status === 401 ? "AUTHENTICATION" : error.status === 429 ? "RATE_LIMIT" : `HTTP_${error.status}`;
        throw new ImageGenerationProviderError(error.message, code, error.status === 429 || error.status >= 500);
      }
      throw new ImageGenerationProviderError(error instanceof Error ? error.message : "画像生成に失敗しました", "PROVIDER_ERROR");
    }
  }
}
