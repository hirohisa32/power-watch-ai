import { describe, expect, it } from "vitest";
import {
  GOLD_KHANJAR_QUARTER_DURATION,
  GOLD_KHANJAR_QUARTER_MODEL,
  GOLD_KHANJAR_QUARTER_SCENES,
  GOLD_KHANJAR_QUARTER_VOICE,
} from "@/lib/demo/gold-khanjar-quarter-test";

describe("Gold Khanjar 1/4 production test", () => {
  it("locks the approved Hayashi v4 narration", () => {
    expect(GOLD_KHANJAR_QUARTER_VOICE).toBe("CeKhvpl894bEZDsRgdlL");
    expect(GOLD_KHANJAR_QUARTER_MODEL).toBe("eleven_v4");
  });

  it("keeps the story test within 12–15 seconds and uses only three Runway scenes", () => {
    expect(GOLD_KHANJAR_QUARTER_DURATION).toBeGreaterThanOrEqual(12);
    expect(GOLD_KHANJAR_QUARTER_DURATION).toBeLessThanOrEqual(15);
    expect(Object.keys(GOLD_KHANJAR_QUARTER_SCENES)).toHaveLength(3);
  });

  it("locks silent illustrated animation without generated watches", () => {
    const prompts = Object.values(GOLD_KHANJAR_QUARTER_SCENES).map((scene) => scene.prompt).join(" ");
    expect(prompts).toContain("Silent");
    expect(prompts).toContain("closed mouth");
    expect(prompts).toContain("editorial illustration");
    expect(prompts).toContain("No photorealism");
    expect(prompts).toContain("No morphing");
    expect(prompts).toContain("No morphing");
  });
});
