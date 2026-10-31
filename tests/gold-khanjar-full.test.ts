import { describe, expect, it } from "vitest";
import {
  GOLD_KHANJAR_ENDING_TRANSITION_SECONDS,
  GOLD_KHANJAR_FULL_MODEL,
  GOLD_KHANJAR_FULL_VOICE,
  GOLD_KHANJAR_NARRATION_SUBTITLES_ENABLED,
  GOLD_KHANJAR_PRODUCT_SCENES,
  GOLD_KHANJAR_REFINED_STORY_SCENES,
  GOLD_KHANJAR_STORY_SCENES,
} from "@/lib/demo/gold-khanjar-full";

describe("Gold Khanjar approved full production", () => {
  it("locks the approved Hayashi voice and v4 model", () => {
    expect(GOLD_KHANJAR_FULL_VOICE).toBe("CeKhvpl894bEZDsRgdlL");
    expect(GOLD_KHANJAR_FULL_MODEL).toBe("eleven_v4");
  });

  it("reuses all three approved quarter scenes and generates only four new story scenes", () => {
    const scenes = Object.values(GOLD_KHANJAR_STORY_SCENES);
    expect(scenes.filter((scene) => scene.source === "approved-quarter")).toHaveLength(3);
    expect(scenes.filter((scene) => scene.source === "runway")).toHaveLength(4);
  });

  it("uses original product photos without generative watch prompts", () => {
    expect(GOLD_KHANJAR_PRODUCT_SCENES).toHaveLength(5);
    expect(GOLD_KHANJAR_PRODUCT_SCENES.map((scene) => scene.file)).toEqual([
      "MG_1220.jpg", "MG_1204.jpg", "MG_1202.jpg", "MG_1200.jpg", "1.jpg",
    ]);
  });

  it("reduces the refined final to nine five-second meaning units", () => {
    expect(GOLD_KHANJAR_REFINED_STORY_SCENES).toHaveLength(4);
    expect(GOLD_KHANJAR_REFINED_STORY_SCENES).toEqual([
      "01-oman-entry", "02-char-01-letter", "03-uk-asprey", "06-char-01-receives",
    ]);
    expect(GOLD_KHANJAR_REFINED_STORY_SCENES.length + GOLD_KHANJAR_PRODUCT_SCENES.length).toBe(9);
  });

  it("uses the approved subtitle-free documentary ending treatment", () => {
    expect(GOLD_KHANJAR_NARRATION_SUBTITLES_ENABLED).toBe(false);
    expect(GOLD_KHANJAR_ENDING_TRANSITION_SECONDS).toBeGreaterThanOrEqual(0.8);
    expect(GOLD_KHANJAR_ENDING_TRANSITION_SECONDS).toBeLessThanOrEqual(1.5);
  });
});

