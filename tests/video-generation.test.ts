import { describe, expect, it } from "vitest";
import { estimateVideoCost, providerDurationForScene } from "@/lib/video/cost";
import {
  decideJobAction,
  generationModeForScene,
  generationObjectKey,
  nextGenerationVersion,
  pickReferenceAssetIds,
  shouldGenerateMissing,
} from "@/lib/video/orchestration";
import { buildVideoPrompt } from "@/lib/video/prompt";

const scene = {
  preset: "ProductHero",
  visualPrompt: "A watch emerges from an archival book in a 1960s study.",
  camera: "slow dolly in",
  shotType: "macro close-up",
  lighting: "warm window key with soft fill",
  motion: "subtle page and dust movement",
  colorMood: "warm walnut and restrained gold",
  transition: "restrained light transition into the next scene",
  duration: 6,
  watchReference: true,
  preferredAssetLabels: ["front", "crown"],
};

describe("video generation domain", () => {
  it("builds provider input from every visual field and exact watch constraints", () => {
    const prompt = buildVideoPrompt(scene, "cinematic_real", "make the move slower");
    for (const value of [
      scene.visualPrompt,
      scene.camera,
      scene.shotType,
      scene.lighting,
      scene.motion,
      scene.colorMood,
      scene.transition,
      "6 seconds",
      "front, crown",
      "make the move slower",
      "Do not redesign",
      "stable silhouette",
    ]) {
      expect(prompt).toContain(value);
    }
  });

  it("routes animation style without losing product constraints", () => {
    const prompt = buildVideoPrompt(scene, "animation");
    expect(prompt).toContain("Premium cinematic animation");
    expect(prompt).toContain("Preserve exactly its dial layout");
  });

  it("keeps product and revision controls within Runway's 1,000-unit prompt limit", () => {
    const prompt = buildVideoPrompt(
      {
        ...scene,
        visualPrompt: "visual ".repeat(300),
        camera: "camera ".repeat(100),
        shotType: "shot ".repeat(100),
        lighting: "light ".repeat(100),
        motion: "motion ".repeat(100),
        colorMood: "color ".repeat(100),
      },
      "cinematic_real",
      "revision ".repeat(100),
    );
    expect(prompt.length).toBeLessThanOrEqual(1000);
    expect(prompt).toContain("exact product identity");
    expect(prompt).toContain("Do not redesign");
    expect(prompt).toContain("Revision instruction");
  });

  it("estimates official Gen-4.5 credits and USD", () => {
    expect(estimateVideoCost("gen4.5", 5, 0.01)).toEqual({ credits: 60, usd: 0.6 });
    expect(estimateVideoCost("future-model", 5)).toEqual({ credits: null, usd: null });
  });

  it("requests a supported provider duration and trims it to the storyboard slot", () => {
    expect(providerDurationForScene(3)).toBe(5);
    expect(providerDurationForScene(5)).toBe(5);
    expect(providerDurationForScene(6)).toBe(10);
  });

  it("maps provider statuses to poll, success, transient retry, and terminal failure", () => {
    expect(decideJobAction({ status: "pending" }, 1, 3)).toEqual({ type: "poll" });
    expect(
      decideJobAction({ status: "succeeded", outputUrl: "https://output/video.mp4" }, 1, 3),
    ).toEqual({ type: "complete", outputUrl: "https://output/video.mp4" });
    expect(
      decideJobAction(
        { status: "failed", code: "INTERNAL", message: "temporary", retryable: true },
        1,
        3,
      ),
    ).toEqual({ type: "retry" });
    expect(
      decideJobAction(
        { status: "failed", code: "ASSET.INVALID", message: "bad asset", retryable: false },
        1,
        3,
      ),
    ).toEqual({ type: "fail", code: "ASSET.INVALID", message: "bad asset" });
  });

  it("versions generations without overwriting and does not regenerate active/completed scenes", () => {
    expect(nextGenerationVersion([1, 2, 4])).toBe(5);
    expect(shouldGenerateMissing([])).toBe(true);
    expect(shouldGenerateMissing(["failed"])).toBe(true);
    expect(shouldGenerateMissing(["completed"])).toBe(false);
    expect(shouldGenerateMissing(["queued"])).toBe(false);
  });

  it("selects preferred registered assets and builds the required R2 key", () => {
    expect(
      pickReferenceAssetIds(
        [
          { id: "a", label: "front" },
          { id: "b", label: "back" },
        ],
        ["front"],
      ),
    ).toEqual(["a"]);
    expect(generationObjectKey("project", "scene", "generation")).toBe(
      "projects/project/scenes/scene/generations/generation.mp4",
    );
  });

  it("prioritizes the strongest preset-specific watch reference and image-to-video", () => {
    const ids = pickReferenceAssetIds(
      [
        { id: "side", label: "Side" },
        { id: "front", label: "Front" },
        { id: "wrist", label: "Wrist" },
      ],
      [],
      "ProductHero",
    );
    expect(ids[0]).toBe("front");
    expect(generationModeForScene(ids)).toBe("image-to-video");
  });

  it("uses anti-invention framing when no real watch reference is available", () => {
    const prompt = buildVideoPrompt(
      { ...scene, preferredAssetLabels: [], referenceAvailable: false },
      "cinematic_real",
    );
    expect(generationModeForScene([])).toBe("text-to-video");
    expect(prompt).toContain("Do not invent a precise frontal watch");
    expect(prompt).toContain("silhouette");
  });
});
