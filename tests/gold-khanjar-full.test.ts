import { describe, expect, it } from "vitest";
import {
  GOLD_KHANJAR_FULL_MODEL,
  GOLD_KHANJAR_FULL_VOICE,
  GOLD_KHANJAR_PRODUCT_SCENES,
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
});

