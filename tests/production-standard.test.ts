import { describe, expect, it } from "vitest";
import { narrationConfig } from "@/lib/audio/config";
import { buildStoryboardPrompt } from "@/lib/storyboard/prompt";
import { buildFinalRenderInput } from "@/lib/render/plan";
import { buildProductPhotoMotionArgs, PRODUCT_EVIDENCE_MODEL } from "@/lib/video/product-photo";
import { HAYASHI_VOICE } from "@/lib/system-media/config";

const scene = {
  sceneId: "story",
  generationId: "generation",
  order: 1,
  preset: "HistoricalEvent",
  duration: 60,
  narration: "時計の物語。",
  subtitle: "時計の物語。",
  year: null,
  location: null,
  objectKey: "story.mp4",
};

const opening = { id: "o", key: "opening", storagePath: "system-assets/opening/o.mp4", duration: 15.072, width: 1080, height: 1920, fps: 24, hasAudio: true };
const ending = { id: "e", key: "ending", storagePath: "system-assets/ending/e.mp4", duration: 5, width: 1080, height: 1920, fps: 30, hasAudio: false };

function media(brand: "power_watch" | "cool_vintage_watch" | "trust_watch", type: "opening" | "ending") {
  const isOpening = type === "opening";
  return {
    id: `${type}-${brand}`,
    key: `${type}_${brand}`,
    storagePath: `system-assets/${type}/${type}_${brand}.mp4`,
    duration: isOpening ? 15.072 : 5,
    width: 1080,
    height: 1920,
    fps: isOpening ? 24 : 30,
    hasAudio: isOpening,
  };
}

describe("Production標準仕様", () => {
  it("Mr Kenji Hayashi / eleven_v4を環境変数に関係なく固定する", () => {
    process.env.ELEVENLABS_DEFAULT_VOICE_ID = "should-not-be-used";
    process.env.ELEVENLABS_MODEL = "eleven_multilingual_v2";
    expect(narrationConfig()).toMatchObject({ defaultVoiceId: HAYASHI_VOICE.voiceId, model: "eleven_v4" });
    expect(HAYASHI_VOICE.name).toBe("Mr Kenji Hayashi");
  });

  it("Opening / 本編 / Endingの尺を動的に計算し、noneで余分な尺を足さない", () => {
    expect(buildFinalRenderInput({ language: "ja", bgmKey: "bgm", scenes: [scene], totalSceneCount: 1, openingAsset: opening, endingAsset: ending }).totalDuration).toBeCloseTo(80.072);
    expect(buildFinalRenderInput({ language: "ja", bgmKey: "bgm", scenes: [scene], totalSceneCount: 1, openingAsset: null, endingAsset: null }).totalDuration).toBe(60);
    expect(buildFinalRenderInput({ language: "ja", bgmKey: "bgm", scenes: [scene], totalSceneCount: 1, openingAsset: opening, endingAsset: null }).endingAsset).toBeNull();
  });

  it("A-D: 指定された4つのStyle / System Asset組合せを保持する", () => {
    const cases = [
      { style: "cinematic_real", opening: media("power_watch", "opening"), ending: media("power_watch", "ending") },
      { style: "cinematic_real", opening: null, ending: null },
      { style: "animation", opening: media("cool_vintage_watch", "opening"), ending: media("cool_vintage_watch", "ending") },
      { style: "animation", opening: media("trust_watch", "opening"), ending: media("trust_watch", "ending") },
    ] as const;
    for (const item of cases) {
      expect(["cinematic_real", "animation"]).toContain(item.style);
      const plan = buildFinalRenderInput({ language: "ja", bgmKey: "bgm", scenes: [scene], totalSceneCount: 1, openingAsset: item.opening, endingAsset: item.ending });
      expect(plan.openingAsset?.key ?? null).toBe(item.opening?.key ?? null);
      expect(plan.endingAsset?.key ?? null).toBe(item.ending?.key ?? null);
      expect(plan.totalDuration).toBeCloseTo(60 + (item.opening?.duration ?? 0) + (item.ending?.duration ?? 0));
    }
  });

  it("I: OpeningとEndingを別ブランドで独立選択できる", () => {
    const plan = buildFinalRenderInput({ language: "ja", bgmKey: "bgm", scenes: [scene], totalSceneCount: 1, openingAsset: media("cool_vintage_watch", "opening"), endingAsset: media("trust_watch", "ending") });
    expect(plan.openingAsset?.key).toBe("opening_cool_vintage_watch");
    expect(plan.endingAsset?.key).toBe("ending_trust_watch");
  });

  it("実写とアニメでStoryは共通、映像表現だけを分ける", () => {
    const common = { script: "時計の歴史を丁寧に語るための台本です。", language: "ja" as const, targetDuration: 60 as const, assetLabels: ["正面"] };
    const real = buildStoryboardPrompt({ ...common, style: "cinematic_real" }).system;
    const animation = buildStoryboardPrompt({ ...common, style: "animation" }).system;
    expect(real).toContain("Photorealistic cinematic historical documentary");
    expect(animation).toContain("professional editorial illustrator");
    expect(real).toContain("ORIGINAL PRODUCT EVIDENCE");
    expect(animation).toContain("ORIGINAL PRODUCT EVIDENCE");
  });

  it("時計写真を非生成の均一変形と画質補正だけで動画化する", () => {
    const args = buildProductPhotoMotionArgs("watch.jpg", "watch.mp4", 5).join(" ");
    expect(PRODUCT_EVIDENCE_MODEL).toBe("original-product-photo-motion-v1");
    expect(args).toContain("zoompan");
    expect(args).toContain("unsharp");
    expect(args).not.toMatch(/perspective|morph|generative|remap|displace/);
  });
});
