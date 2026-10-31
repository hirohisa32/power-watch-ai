import { describe, expect, it } from "vitest";
import { buildStoryboardPrompt } from "@/lib/storyboard/prompt";
import {
  narrationOnlySubtitles,
  storyboardOutputSchema,
  totalStoryboardDuration,
  validateStoryboard,
} from "@/lib/storyboard/schema";
import { EPOCA_STORY_STYLE } from "@/lib/storyboard/styles/epoca-story";
import { storyboardFixture } from "./fixtures/storyboard";

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
    expect(validateStoryboard(fixture, 60, ["Front"]).scenes[2].preferredAssetLabels).toEqual([
      "Front",
    ]);
  });

  it("normalizes required watch references to an available asset", () => {
    const fixture = storyboardFixture(60);
    const hero = fixture.scenes.at(-2)!;
    hero.watchReference = false;
    hero.preferredAssetLabels = ["Invented Angle"];
    const result = validateStoryboard(fixture, 60, ["Front"]);
    expect(result.scenes.at(-2)).toMatchObject({
      watchReference: true,
      preferredAssetLabels: ["Front"],
    });
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
  });
});
