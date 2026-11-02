import { describe, expect, it } from "vitest";
import { assertStoryQuality, evaluateStoryQuality } from "@/lib/storyboard/story-quality";

describe("SNS Reel story quality gate", () => {
  const scenes = [
    { storyPhase: "hook", narration: "1945年に生まれた名機。", watchReference: false },
    { storyPhase: "context", narration: "精度を極めた源流。", watchReference: false },
    {
      storyPhase: "reason",
      narration: "この仕様には歴史的な理由があります。",
      watchReference: false,
    },
    {
      storyPhase: "evidence",
      narration: "刻印が出自を語ります。",
      watchReference: true,
      productPhotoRole: "hallmark",
    },
    {
      storyPhase: "evidence",
      narration: "機械に証が残ります。",
      watchReference: true,
      productPhotoRole: "movement_detail",
    },
    {
      storyPhase: "reveal",
      narration: "美しいディテール。",
      watchReference: true,
      productPhotoRole: "dial",
    },
    {
      storyPhase: "reveal",
      narration: "そのすべてが現れます。",
      watchReference: true,
      productPhotoRole: "front",
    },
    {
      storyPhase: "payoff",
      narration: "歴史を宿す、この特別な一本です。",
      watchReference: true,
      productPhotoRole: "hero",
    },
  ];

  it("passes an ordered evidence-to-desire arc", () => {
    const result = evaluateStoryQuality(scenes);
    expect(result.status).toBe("pass");
    expect(result.average).toBeGreaterThanOrEqual(85);
    expect(result.purchaseDesire).toBeGreaterThanOrEqual(80);
    expect(() => assertStoryQuality(result)).not.toThrow();
  });

  it("blocks a product-free explanation without payoff", () => {
    const result = evaluateStoryQuality(
      scenes
        .slice(0, 3)
        .map((scene) => ({ ...scene, storyPhase: "context", watchReference: false })),
    );
    expect(result.status).toBe("ng");
    expect(() => assertStoryQuality(result)).toThrow();
  });
});
