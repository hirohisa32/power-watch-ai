import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadValidatedMp4 } from "@/lib/video/download";

afterEach(() => vi.unstubAllGlobals());

describe("provider output validation", () => {
  it("accepts a non-empty bounded MP4", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([0, 0, 0, 1]), {
          status: 200,
          headers: { "content-type": "video/mp4", "content-length": "4" },
        }),
      ),
    );
    await expect(
      downloadValidatedMp4("https://output.example/video.mp4", {
        timeoutMs: 1_000,
        maxBytes: 100,
      }),
    ).resolves.toHaveLength(4);
  });

  it("rejects HTTP errors, invalid content types, oversize and non-HTTPS output", async () => {
    await expect(
      downloadValidatedMp4("http://output.example/video.mp4", {
        timeoutMs: 1_000,
        maxBytes: 100,
      }),
    ).rejects.toThrow("HTTPS");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("error", { status: 502, headers: { "content-type": "text/plain" } }),
        ),
    );
    await expect(
      downloadValidatedMp4("https://output.example/video.mp4", {
        timeoutMs: 1_000,
        maxBytes: 100,
      }),
    ).rejects.toThrow("HTTP_502");
  });
});
