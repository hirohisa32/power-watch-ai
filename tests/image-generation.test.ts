import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { estimateOpenAiImageCost } from "@/lib/image/cost";
import {
  buildAnimationKeyframePrompt,
  buildCharacterReferencePrompt,
  characterKeyForScene,
} from "@/lib/image/prompt";
import { inspectKeyframe } from "@/lib/image/quality";

afterEach(() => {
  delete process.env.OPENAI_IMAGE_TEXT_INPUT_USD_PER_MILLION;
  delete process.env.OPENAI_IMAGE_INPUT_USD_PER_MILLION;
  delete process.env.OPENAI_IMAGE_OUTPUT_USD_PER_MILLION;
});

describe("Production画像生成Pipeline", () => {
  it("Text / Image Input / Image Output tokenをOpenAI API原価へ合算する", () => {
    expect(
      estimateOpenAiImageCost({
        textInputTokens: 500,
        imageInputTokens: 1_000,
        imageOutputTokens: 2_000,
      }),
    ).toBe(0.0705);
  });

  it("同一人物のCharacter BibleをScene間で再利用し、時計を生成対象から除外する", () => {
    const scene = {
      order: 2,
      preset: "HistoricalCharacter",
      title: "オマーン側の功労者",
      visualDescription: "人物が書簡へ静かに視線を落とす",
      visualPrompt: "Silent historical acting",
      camera: "slow dolly",
      shotType: "medium close-up",
      lighting: "warm window light",
      colorMood: "muted archival",
      year: "1970s",
      location: "OMAN",
    };
    expect(characterKeyForScene(scene)).toBe("CHAR_01");
    expect(buildCharacterReferencePrompt("CHAR_01")).toContain("same Omani man");
    const prompt = buildAnimationKeyframePrompt(scene, "CHAR_01");
    expect(prompt).toContain("One shot, one clear action");
    expect(prompt).toContain("Do not show or invent a wristwatch");
    expect(prompt).toContain("Product imagery is composited separately");
  });

  it("9:16 Production解像度のKeyframeのみ構造Quality Gateを通す", async () => {
    const good = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: "#222" } })
      .jpeg()
      .toBuffer();
    const bad = await sharp({ create: { width: 640, height: 640, channels: 3, background: "#222" } })
      .jpeg()
      .toBuffer();
    expect((await inspectKeyframe(good)).pass).toBe(true);
    const failed = await inspectKeyframe(bad);
    expect(failed.pass).toBe(false);
    expect(failed.reasons.length).toBeGreaterThan(0);
  });
});
