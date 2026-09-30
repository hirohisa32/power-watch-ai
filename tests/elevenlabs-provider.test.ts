import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ElevenLabsError, ElevenLabsNarrationProvider } from "@/lib/audio/elevenlabs";

describe("ElevenLabs narration adapter", () => {
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    process.env.ELEVENLABS_DEFAULT_VOICE_ID = "voice-1";
    process.env.ELEVENLABS_MODEL = "eleven_multilingual_v2";
  });

  afterEach(() => {
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_DEFAULT_VOICE_ID;
    delete process.env.ELEVENLABS_MODEL;
  });

  it("sends one server-side multilingual TTS request and records character cost", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "audio/mpeg",
          "character-cost": "17",
          "request-id": "request-1",
        },
      }),
    );
    const provider = new ElevenLabsNarrationProvider(fetcher);
    await expect(
      provider.generate({ text: "時間は受け継がれる。", speed: 1.08 }),
    ).resolves.toMatchObject({
      characterCost: 17,
      requestId: "request-1",
      contentType: "audio/mpeg",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toContain("/v1/text-to-speech/voice-1");
    expect(init.headers["xi-api-key"]).toBe("test-key");
    expect(JSON.parse(init.body)).toMatchObject({
      text: "時間は受け継がれる。",
      model_id: "eleven_multilingual_v2",
      voice_settings: { speed: 1.08, style: 0 },
      apply_text_normalization: "auto",
      apply_language_text_normalization: true,
    });
    expect(JSON.parse(init.body).text).toBe("時間は受け継がれる。");
  });

  it("returns a natural credit error without retrying the API", async () => {
    const provider = new ElevenLabsNarrationProvider(
      vi.fn().mockResolvedValue(new Response("quota", { status: 402 })),
    );
    await expect(provider.generate({ text: "test", speed: 1 })).rejects.toMatchObject({
      code: "CREDITS",
      message: "ElevenLabsのクレジット残高を確認してください",
    } satisfies Partial<ElevenLabsError>);
  });

  it("maps Voice Library results without generating audio", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        voices: [
          {
            voice_id: "library-1",
            public_owner_id: "owner-1",
            name: "Japanese Narrator",
            gender: "male",
            description: "calm documentary",
            preview_url: "https://example.com/preview.mp3",
          },
        ],
        has_more: false,
        total_count: 1,
      }),
    );
    const provider = new ElevenLabsNarrationProvider(fetcher);
    await expect(
      provider.listLibraryVoices({ language: "ja", gender: "male", pageSize: 5 }),
    ).resolves.toMatchObject({
      voices: [{ voiceId: "library-1", publicOwnerId: "owner-1" }],
      hasMore: false,
      totalCount: 1,
    });
    expect(String(fetcher.mock.calls[0][0])).toContain("/v1/shared-voices?");
    expect(String(fetcher.mock.calls[0][0])).toContain("language=ja");
  });
});
