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
  generate(input: { text: string; speed: number; voiceId?: string }): Promise<NarrationResult>;
  listLibraryVoices(input?: VoiceLibraryQuery): Promise<VoiceLibraryResult>;
}

export type VoiceLibraryQuery = {
  language?: "ja" | "en" | "zh";
  gender?: "male" | "female" | "neutral";
  age?: string;
  category?: "professional" | "famous" | "high_quality";
  accent?: string;
  useCases?: string[];
  descriptives?: string[];
  search?: string;
  page?: number;
  pageSize?: number;
};

export type VoiceLibraryVoice = {
  voiceId: string;
  publicOwnerId?: string;
  name: string;
  gender?: string;
  language?: string;
  locale?: string;
  age?: string;
  category?: string;
  accent?: string;
  useCases: string[];
  descriptives: string[];
  verifiedLanguages: string[];
  description?: string;
  previewUrl?: string;
};

export type VoiceLibraryResult = {
  voices: VoiceLibraryVoice[];
  hasMore: boolean;
  totalCount?: number;
};

export class ElevenLabsNarrationProvider implements NarrationProvider {
  readonly name = "elevenlabs";

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async generate(input: {
    text: string;
    speed: number;
    voiceId?: string;
  }): Promise<NarrationResult> {
    const config = narrationConfig();
    const voiceId = input.voiceId || config.defaultVoiceId;
    if (!config.apiKey || !voiceId)
      throw new ElevenLabsError("AUTH", "ElevenLabsの設定が不足しています");
    let response: Response;
    try {
      response = await this.fetcher(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
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
      if (response.status === 400 || response.status === 404 || response.status === 422)
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

  async listLibraryVoices(input: VoiceLibraryQuery = {}): Promise<VoiceLibraryResult> {
    const config = narrationConfig();
    if (!config.apiKey)
      throw new ElevenLabsError("AUTH", "ElevenLabsの設定が不足しています");
    const params = new URLSearchParams({
      page: String(Math.max(0, input.page ?? 0)),
      page_size: String(Math.min(100, Math.max(1, input.pageSize ?? 30))),
      sort: "trending",
    });
    if (input.language) params.set("language", input.language);
    if (input.gender) params.set("gender", input.gender);
    if (input.age) params.set("age", input.age);
    if (input.category) params.set("category", input.category);
    if (input.accent) params.set("accent", input.accent);
    input.useCases?.forEach((value) => params.append("use_cases", value));
    input.descriptives?.forEach((value) => params.append("descriptives", value));
    if (input.search?.trim()) params.set("search", input.search.trim());
    let response: Response;
    try {
      response = await this.fetcher(`https://api.elevenlabs.io/v1/shared-voices?${params}`, {
        headers: { "xi-api-key": config.apiKey },
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (error) {
      throw new ElevenLabsError(
        "NETWORK",
        error instanceof Error ? error.message : "Voice Libraryへの接続に失敗しました",
        true,
      );
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        throw new ElevenLabsError("AUTH", "ElevenLabsの認証を確認してください");
      if (response.status === 429)
        throw new ElevenLabsError("CREDITS", "ElevenLabsの利用制限を確認してください");
      throw new ElevenLabsError(
        "PROVIDER",
        `Voice Libraryの取得に失敗しました (${response.status})`,
        response.status >= 500,
      );
    }
    const body = (await response.json()) as {
      voices?: Array<{
        voice_id?: string;
        public_owner_id?: string;
        name?: string;
        gender?: string;
        language?: string;
        locale?: string;
        age?: string;
        category?: string;
        accent?: string;
        use_case?: string;
        use_cases?: string[];
        descriptives?: string[];
        verified_languages?: Array<{ language?: string; locale?: string }>;
        description?: string;
        preview_url?: string;
      }>;
      has_more?: boolean;
      total_count?: number;
    };
    return {
      voices: (body.voices ?? [])
        .filter((voice) => Boolean(voice.voice_id))
        .map((voice) => ({
          voiceId: voice.voice_id!,
          publicOwnerId: voice.public_owner_id,
          name: voice.name || voice.voice_id!,
          gender: voice.gender,
          language: voice.language,
          locale: voice.locale,
          age: voice.age,
          category: voice.category,
          accent: voice.accent,
          useCases: voice.use_cases ?? (voice.use_case ? [voice.use_case] : []),
          descriptives: voice.descriptives ?? [],
          verifiedLanguages: (voice.verified_languages ?? [])
            .flatMap((item) => [item.language, item.locale])
            .filter((value): value is string => Boolean(value)),
          description: voice.description,
          previewUrl: voice.preview_url,
        })),
      hasMore: Boolean(body.has_more),
      totalCount: body.total_count,
    };
  }
}
