import { describe, expect, it } from "vitest";
import { hasValidImageSignature } from "@/lib/images";
import { assetLabelSchema, projectInputSchema, watchImageSchema } from "@/lib/validation";

describe("projectInputSchema", () => {
  it("accepts a valid watch project", () => {
    const value = projectInputSchema.parse({
      title: "Speedmaster Story",
      script: "これは20文字を十分に超える時計の物語用の台本テキストです。",
      style: "cinematic_real",
      language: "ja",
      targetDuration: 60,
    });
    expect(value.title).toBe("Speedmaster Story");
  });
  it("rejects unsupported duration", () => {
    expect(() =>
      projectInputSchema.parse({
        title: "Watch",
        script: "A historical watch story with enough narration.",
        style: "animation",
        language: "en",
        targetDuration: 75,
      }),
    ).toThrow();
  });
});

describe("watch image validation", () => {
  it("accepts private reference image constraints", () => {
    expect(watchImageSchema.parse({ type: "image/webp", size: 1024 }).type).toBe("image/webp");
    expect(assetLabelSchema.parse("Dial Macro")).toBe("Dial Macro");
  });
  it("rejects SVG and oversized files", () => {
    expect(() => watchImageSchema.parse({ type: "image/svg+xml", size: 100 })).toThrow();
    expect(() => watchImageSchema.parse({ type: "image/png", size: 16 * 1024 * 1024 })).toThrow();
  });
});

describe("image content validation", () => {
  it("recognizes supported file signatures", () => {
    expect(
      hasValidImageSignature(
        Uint8Array.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        "image/jpeg",
      ),
    ).toBe(true);
    expect(
      hasValidImageSignature(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
        "image/png",
      ),
    ).toBe(true);
  });

  it("rejects a spoofed mime type", () => {
    expect(hasValidImageSignature(new TextEncoder().encode("not-an-image"), "image/jpeg")).toBe(
      false,
    );
  });
});
