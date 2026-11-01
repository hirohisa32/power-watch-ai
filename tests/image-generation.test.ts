import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { estimateOpenAiImageCost } from "@/lib/image/cost";
import { supportsInputFidelity } from "@/lib/image/config";
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
  it("モデル非対応Parameterを画像編集Requestへ送らない", () => {
    expect(supportsInputFidelity("gpt-image-1")).toBe(true);
    expect(supportsInputFidelity("gpt-image-1.5")).toBe(true);
    expect(supportsInputFidelity("gpt-image-2.5-sunburst")).toBe(false);
  });

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

  it("実写調Story Sceneは高級ドキュメンタリー用Keyframeを生成する", () => {
    const scene = {
      order: 1,
      preset: "HistoricalCharacter",
      title: "時計工房",
      visualDescription: "職人が測定器へ静かに視線を落とす",
      visualPrompt: "Silent historical acting",
      camera: "slow dolly",
      shotType: "medium close-up",
      lighting: "warm window light",
      colorMood: "muted archival",
      year: "1945",
      location: "Switzerland",
    };
    const prompt = buildAnimationKeyframePrompt(
      scene,
      null,
      { title: "Jaeger-LeCoultre", script: "1945 Swiss watchmaking France" },
      "cinematic_real",
    );
    expect(prompt).toContain("premium cinematic documentary still");
    expect(prompt).toContain("photorealistic people and environments");
    expect(prompt).not.toContain("editorial animation by a senior luxury illustrator");
  });

  it("Jaeger ProjectへGold Khanjar人物Bibleを混入させない", () => {
    const project = {
      title: "Jaeger-LeCoultre Calibre 478",
      script: "フランスとスイスを結ぶ時計製造史",
    };
    const scene = {
      order: 9,
      preset: "HistoricalCharacter",
      title: "国境を越えた職人の歴史",
      visualDescription: "旅する職人を匿名の後ろ姿で捉える",
      visualPrompt: "16th century France to Geneva",
      camera: "slow dolly",
      shotType: "wide",
      lighting: "overcast natural light",
      colorMood: "muted archival",
      year: "16th century",
      location: "France to Geneva",
    };
    expect(characterKeyForScene(scene)).toBeNull();
    const prompt = buildAnimationKeyframePrompt(scene, null, project, "animation");
    expect(prompt).not.toMatch(/Omani|disha?dasha|bisht|turban|desert/i);
    expect(prompt).toContain("Project story boundary: Jaeger-LeCoultre");
    expect(prompt).toContain("hand-crafted editorial drawing");
  });

  it("9:16 Production解像度のKeyframeのみ構造Quality Gateを通す", async () => {
    const good = await sharp({
      create: { width: 1024, height: 1536, channels: 3, background: "#222" },
    })
      .jpeg()
      .toBuffer();
    const bad = await sharp({
      create: { width: 640, height: 640, channels: 3, background: "#222" },
    })
      .jpeg()
      .toBuffer();
    expect((await inspectKeyframe(good)).pass).toBe(true);
    const failed = await inspectKeyframe(bad);
    expect(failed.pass).toBe(false);
    expect(failed.reasons.length).toBeGreaterThan(0);
  });
});
