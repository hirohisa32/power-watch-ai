import { describe, expect, it } from "vitest";
import {
  evaluateFinalProductArc,
  planProductPhotoUsageWithAssets,
} from "@/lib/storyboard/product-photo-planner";
import { storyboardFixture } from "./fixtures/storyboard";

describe("single product photo production rule", () => {
  it("uses the exact Human role only for middle evidence and final payoff", () => {
    const fixture = storyboardFixture(60);
    for (const scene of fixture.scenes) {
      if (!["Opening", "Ending"].includes(scene.preset)) {
        scene.watchReference = true;
        scene.preferredAssetLabels = ["別アングル"];
        scene.productPhotoRole = "hero";
        scene.visualType = "product_photo";
      }
    }

    const planned = planProductPhotoUsageWithAssets(fixture.scenes, [
      { label: "文字盤アップ", humanLabel: "文字盤アップ", detectedRole: "movement_wide" },
    ]);
    const uses = planned
      .map((scene, index) => ({ scene, index }))
      .filter(({ scene }) => scene.watchReference);

    expect(uses).toHaveLength(2);
    expect(uses[0].index).toBeGreaterThanOrEqual(Math.floor(planned.length * 0.35));
    expect(uses[1].index).toBe(planned.length - 2);
    expect(uses[1].index - uses[0].index).toBeGreaterThan(1);
    expect(uses.every(({ scene }) => scene.preferredAssetLabels[0] === "文字盤アップ")).toBe(true);
    expect(uses.every(({ scene }) => scene.productPhotoRole === "dial_macro")).toBe(true);
    expect(uses[0].scene.visualIntent).toContain("Evidence");
    expect(uses[1].scene.visualIntent).toContain("Hero / Payoff");
  });

  it("turns surplus product scenes into non-watch story scenes without inventing angles", () => {
    const fixture = storyboardFixture(60);
    const planned = planProductPhotoUsageWithAssets(fixture.scenes, [
      { label: "裏蓋", humanLabel: "裏蓋" },
    ]);
    const nonProduct = planned.filter((scene) => !scene.watchReference);

    expect(planned.filter((scene) => scene.watchReference)).toHaveLength(2);
    expect(nonProduct.every((scene) => scene.preferredAssetLabels.length === 0)).toBe(true);
    expect(nonProduct.every((scene) => scene.productPhotoRole === null)).toBe(true);
    expect(
      planned
        .filter((scene) => scene.watchReference)
        .every((scene) => scene.visualPrompt.includes("without redrawing")),
    ).toBe(true);
  });

  it("accepts an evidence-role photograph as the final payoff in single-photo mode", () => {
    const result = evaluateFinalProductArc([
      {
        watchReference: true,
        productPhotoRole: "caseback",
        preferredAssetLabels: ["裏蓋"],
      },
      { watchReference: false, productPhotoRole: null, preferredAssetLabels: [] },
      {
        watchReference: true,
        productPhotoRole: "caseback",
        preferredAssetLabels: ["裏蓋"],
      },
    ]);
    expect(result.singlePhotoMode).toBe(true);
    expect(result.passed).toBe(true);
  });

  it("does not relax the payoff gate when different photographs are used", () => {
    const result = evaluateFinalProductArc([
      {
        watchReference: true,
        productPhotoRole: "dial",
        preferredAssetLabels: ["文字盤"],
      },
      {
        watchReference: true,
        productPhotoRole: "caseback",
        preferredAssetLabels: ["裏蓋"],
      },
    ]);
    expect(result.singlePhotoMode).toBe(false);
    expect(result.passed).toBe(false);
  });
});
