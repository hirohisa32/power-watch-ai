import { describe, expect, it } from "vitest";
import { buildStoryboardPrompt } from "@/lib/storyboard/prompt";
import {
  narrationOnlySubtitles,
  storyboardOutputSchema,
  totalStoryboardDuration,
  validateStoryboard,
} from "@/lib/storyboard/schema";
import { EPOCA_STORY_STYLE } from "@/lib/storyboard/styles/epoca-story";
import { calculateStoryBodyDuration } from "@/lib/storyboard/duration";
import { storyboardFixture } from "./fixtures/storyboard";

function bodyFixture(sceneCount: 10 | 15) {
  const source = storyboardFixture(60).scenes;
  const selected =
    sceneCount === 10 ? [...source.slice(0, 8), source.at(-2)!, source.at(-1)!] : source;
  return {
    scenes: selected.map((scene, index) => ({
      ...scene,
      sceneNumber: index + 1,
      narration: `Narration for scene ${index + 1}`,
      narrationSegmentId: `segment-${String(index + 1).padStart(2, "0")}`,
      visualIntent: `Show evidence for narration scene ${index + 1}`,
      visualSubject: `Narration scene ${index + 1} subject`,
    })),
  };
}

describe("storyboard schema", () => {
  it("validates structured storyboard output", () => {
    expect(storyboardOutputSchema.safeParse(storyboardFixture(60)).success).toBe(true);
  });

  it("rejects invalid structured output", () => {
    expect(storyboardOutputSchema.safeParse({ scenes: [{ title: "incomplete" }] }).success).toBe(
      false,
    );
  });

  it("validates and balances a 60 second storyboard", () => {
    const fixture = storyboardFixture(60);
    fixture.scenes[0].duration = 4;
    expect(totalStoryboardDuration(validateStoryboard(fixture, 60, []))).toBe(60);
  });

  it("validates and balances a 90 second storyboard", () => {
    const fixture = storyboardFixture(90);
    fixture.scenes[0].duration = 6;
    expect(totalStoryboardDuration(validateStoryboard(fixture, 90, []))).toBe(90);
  });

  it("rejects non-sequential scene order", () => {
    const fixture = storyboardFixture(60);
    fixture.scenes[3].sceneNumber = 9;
    expect(() => validateStoryboard(fixture, 60, [])).toThrow("Scene番号");
  });

  it("replaces unknown watch asset labels with an available asset", () => {
    const fixture = storyboardFixture(60);
    fixture.scenes[2] = {
      ...fixture.scenes[2],
      watchReference: true,
      preferredAssetLabels: ["Invented Angle"],
    };
    const result = validateStoryboard(fixture, 60, ["Front"]);
    expect(
      result.scenes
        .flatMap((scene) => scene.preferredAssetLabels)
        .every((label) => label === "Front"),
    ).toBe(true);
  });

  it("normalizes required watch references to an available asset", () => {
    const fixture = storyboardFixture(60);
    const hero = fixture.scenes.at(-2)!;
    hero.watchReference = false;
    hero.preferredAssetLabels = ["Invented Angle"];
    const result = validateStoryboard(fixture, 60, ["Front"]);
    expect(
      result.scenes.some(
        (scene) => scene.watchReference && scene.preferredAssetLabels[0] === "Front",
      ),
    ).toBe(true);
    expect(result.scenes.filter((scene) => scene.watchReference)).toHaveLength(2);
  });

  it("rejects a missing script before an API call", () => {
    expect(() =>
      buildStoryboardPrompt({
        script: " ",
        style: "animation",
        language: "ja",
        targetDuration: 60,
        assetLabels: [],
      }),
    ).toThrow("MISSING_SCRIPT");
  });

  it("loads the EPOCA story style and applies reference-derived duration rules", () => {
    expect(EPOCA_STORY_STYLE.storyStructure).toEqual([
      "HOOK",
      "ERA_OR_WORLD",
      "CHARACTER",
      "EVENT",
      "WATCH_CONNECTION",
      "ORIGINAL_PRODUCT_EVIDENCE",
      "DETAIL_OR_EVIDENCE",
      "EMOTIONAL_PAYOFF",
    ]);
    const result = validateStoryboard(storyboardFixture(60), 60, []);
    expect(result.scenes[0].duration).toBeLessThanOrEqual(
      EPOCA_STORY_STYLE.sceneDurationRules.Opening.max,
    );
    expect(result.scenes.at(-1)!.duration).toBeLessThanOrEqual(
      EPOCA_STORY_STYLE.sceneDurationRules.Ending.max,
    );
  });

  it("does not require legacy generated opening or ending scenes", () => {
    const fixture = storyboardFixture(60);
    fixture.scenes[2].preset = "HistoricalEvent";
    expect(() => validateStoryboard(fixture, 60, [])).not.toThrow();
  });

  it("normalizes system-media presets when they appear in generated body scenes", () => {
    const fixture = storyboardFixture(60);
    fixture.scenes[1].preset = "Opening";
    fixture.scenes[2].preset = "Ending";
    const result = validateStoryboard(fixture, 60, []);
    expect(result.scenes[1].preset).toBe("HistoricalEvent");
    expect(result.scenes[2].preset).toBe("ProductHero");
  });

  it("replaces internal subtitle copy with spoken narration", () => {
    const fixture = storyboardFixture(60);
    fixture.scenes[4].subtitle = "SCENE 05 — PRODUCT DETAIL";
    expect(narrationOnlySubtitles(fixture).scenes[4].subtitle).toBe(fixture.scenes[4].narration);
  });

  it("includes coherent narration, external media, and original-product evidence rules", () => {
    const prompt = buildStoryboardPrompt({
      script: "一本の時計がレーサーと歩んだ歴史。",
      style: "animation",
      language: "ja",
      targetDuration: 60,
      assetLabels: ["Front"],
    }).system;
    expect(prompt).toContain("one coherent, human documentary narration");
    expect(prompt).toContain("Opening and ending are independent pre-made System Assets");
    expect(prompt).toContain("ORIGINAL PRODUCT EVIDENCE");
    expect(prompt).toContain("Never redraw, stylize, reconstruct");
    expect(prompt).toContain("SINGLE PRODUCT PHOTO RULE");
  });

  const opening = { durationMs: 15_100 };
  const ending = { durationMs: 3_500 };
  const durationMatrix = [
    { label: "60秒 × 写真1枚", total: 60 as const, labels: ["正面"], scenes: 10 as const },
    {
      label: "60秒 × 写真複数",
      total: 60 as const,
      labels: ["正面", "文字盤", "裏蓋"],
      scenes: 10 as const,
    },
    { label: "90秒 × 写真1枚", total: 90 as const, labels: ["正面"], scenes: 15 as const },
    {
      label: "90秒 × 写真複数",
      total: 90 as const,
      labels: ["正面", "文字盤", "裏蓋"],
      scenes: 15 as const,
    },
  ];

  it.each(durationMatrix)(
    "validates $label without a provider call",
    ({ total, labels, scenes }) => {
      const bodyDuration = calculateStoryBodyDuration(total, opening, ending);
      const result = validateStoryboard(bodyFixture(scenes), bodyDuration, labels);
      expect(totalStoryboardDuration(result)).toBe(bodyDuration);
      expect(result.scenes.every((scene) => scene.duration >= 3 && scene.duration <= 8)).toBe(true);
      if (labels.length === 1) {
        const uses = result.scenes.filter((scene) =>
          scene.preferredAssetLabels.includes(labels[0]),
        );
        expect(uses.length).toBeLessThanOrEqual(2);
        expect(
          uses.every(
            (scene, index) => index === 0 || scene.sceneNumber > uses[index - 1].sceneNumber + 1,
          ),
        ).toBe(true);
      }
    },
  );
});
