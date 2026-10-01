import { describe, expect, it } from "vitest";
import {
  GOLD_KHANJAR_APPROVED_NARRATION_DURATION_SECONDS,
  GOLD_KHANJAR_IDENTITY,
  GOLD_KHANJAR_NARRATION_END_SECONDS,
  GOLD_KHANJAR_NARRATION_START_SECONDS,
  GOLD_KHANJAR_TIMELINE,
} from "@/lib/demo/gold-khanjar";

describe("Gold Khanjar approved narration timeline", () => {
  it("keeps the 43.47 second narration intact inside the 60 second edit", () => {
    expect(GOLD_KHANJAR_APPROVED_NARRATION_DURATION_SECONDS).toBe(43.47);
    expect(GOLD_KHANJAR_NARRATION_START_SECONDS).toBe(15.2);
    expect(GOLD_KHANJAR_NARRATION_END_SECONDS).toBeCloseTo(58.67, 5);
  });

  it("is contiguous from the fixed opening through the brand ending", () => {
    expect(GOLD_KHANJAR_TIMELINE[0].start).toBe(0);
    expect(GOLD_KHANJAR_TIMELINE.at(-1)?.end).toBe(60);

    for (let index = 1; index < GOLD_KHANJAR_TIMELINE.length; index += 1) {
      expect(GOLD_KHANJAR_TIMELINE[index].start).toBe(
        GOLD_KHANJAR_TIMELINE[index - 1].end,
      );
    }
  });

  it("preserves the required wrist-to-reaction-to-macro continuity", () => {
    const titles = GOLD_KHANJAR_TIMELINE.map((shot) => shot.title);
    expect(titles).toContain("Wrist → Reaction → 視線");
    expect(titles).toContain("視線先のDial Macro");
    expect(titles.indexOf("視線先のDial Macro")).toBe(
      titles.indexOf("Wrist → Reaction → 視線") + 1,
    );
  });

  it("uses the source-authoritative serial 5082955", () => {
    expect(GOLD_KHANJAR_IDENTITY.serial).toBe("5082955");
    expect(GOLD_KHANJAR_IDENTITY.serialEditingAllowed).toBe(false);
    expect(GOLD_KHANJAR_TIMELINE.find((shot) => shot.order === 17)?.title).toContain("5082955");
    expect(GOLD_KHANJAR_TIMELINE.some((shot) => shot.title.includes("5082935"))).toBe(false);
  });
});
