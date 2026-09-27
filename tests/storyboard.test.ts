import { describe, expect, it } from "vitest";
import { buildStoryboardPrompt } from "@/lib/storyboard/prompt";
import {
  storyboardOutputSchema,
  totalStoryboardDuration,
  validateStoryboard,
} from "@/lib/storyboard/schema";
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
});
