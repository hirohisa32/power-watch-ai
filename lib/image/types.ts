export type ImagePurpose =
  | "character_reference"
  | "scene_keyframe"
  | "historical_scene"
  | "environment"
  | "story_scene";

export type ImageReference = { bytes: Uint8Array; mimeType: string; name: string };

export type ImageGenerationInput = {
  prompt: string;
  purpose: ImagePurpose;
  references?: ImageReference[];
};

export type ImageGenerationResult = {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  model: string;
  requestId: string | null;
  imageInputTokens: number;
  imageOutputTokens: number;
  textInputTokens: number;
};

export interface ImageGenerationProvider {
  readonly name: string;
  readonly model: string;
  generate(input: ImageGenerationInput): Promise<ImageGenerationResult>;
}

export class ImageGenerationProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "ImageGenerationProviderError";
  }
}
