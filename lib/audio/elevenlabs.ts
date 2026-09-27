import "server-only";
import { narrationConfig } from "./config";

export class ElevenLabsError extends Error {
  name = "ElevenLabsError";
  constructor(
    public code: "AUTH" | "CREDITS" | "INVALID_REQUEST" | "NETWORK" | "PROVIDER",
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}

export type NarrationResult = {
  bytes: Uint8Array;
  contentType: string;
  characterCost: number;
  requestId?: string;
};

export interface NarrationProvider {
  readonly name: string;
  generate(input: { text: string; speed: number }): Promise<NarrationResult>;
}

export class ElevenLabsNarrationProvider implements NarrationProvider {
  readonly name = "elevenlabs";

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async generate(input: { text: string; speed: number }): Promise<NarrationResult> {
    const config = narrationConfig();
    if (!config.apiKey || !config.voiceId)
      throw new ElevenLabsError("AUTH", "ElevenLabsの設定が不足しています");
    let response: Response;
    try {
      response = await this.fetcher(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voiceId)}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "xi-api-key": config.apiKey },
          body: JSON.stringify({
            text: input.text,
            model_id: config.model,
            voice_settings: {
              stability: 0.58,
              similarity_boost: 0.76,
              style: 0.12,
              use_speaker_boost: true,
              speed: input.speed,
            },
          }),
          signal: AbortSignal.timeout(config.timeoutMs),
        },
      );
    } catch (error) {
      throw new ElevenLabsError(
        "NETWORK",
        error instanceof Error ? error.message : "ElevenLabsへの接続に失敗しました",
        true,
      );
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      if (response.status === 401 || response.status === 403)
        throw new ElevenLabsError("AUTH", "ElevenLabsの認証を確認してください");
      if (response.status === 402 || response.status === 429)
        throw new ElevenLabsError("CREDITS", "ElevenLabsのクレジット残高を確認してください");
      if (response.status === 400 || response.status === 422)
        throw new ElevenLabsError("INVALID_REQUEST", "ナレーション原稿を確認してください");
      throw new ElevenLabsError(
        "PROVIDER",
        `ElevenLabsで音声生成に失敗しました (${response.status}${detail ? `: ${detail.slice(0, 120)}` : ""})`,
        response.status >= 500,
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new ElevenLabsError("PROVIDER", "生成音声が空でした", true);
    const headerCost = Number(response.headers.get("character-cost"));
    return {
      bytes,
      contentType: response.headers.get("content-type") || "audio/mpeg",
      characterCost:
        Number.isFinite(headerCost) && headerCost > 0 ? headerCost : [...input.text].length,
      requestId: response.headers.get("request-id") || undefined,
    };
  }
}
