import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  FIXED_OPENING_MASTER,
  fixedOpeningMasterPath,
  isFixedOpeningPreset,
} from "@/lib/opening/fixed-master";

describe("POWER WATCH fixed Opening system asset", () => {
  it("stores the Human master byte-for-byte at the protected shared path", async () => {
    const bytes = await readFile(fixedOpeningMasterPath());
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(FIXED_OPENING_MASTER.sha256);
    expect(bytes.byteLength).toBe(24_147_435);
  });

  it("disables generation and watch replacement with zero Opening credits", () => {
    expect(FIXED_OPENING_MASTER).toMatchObject({
      file: "assets/opening/opening-master.mp4",
      durationSeconds: 15.07,
      width: 1080,
      height: 1920,
      fps: 24,
      openingCredits: 0,
      generationEnabled: false,
      replacementEnabled: false,
    });
  });

  it("recognizes every legacy Opening storyboard preset", () => {
    expect(["Opening", "VintageRoom", "OldBook", "WatchReveal"].every(isFixedOpeningPreset)).toBe(
      true,
    );
    expect(isFixedOpeningPreset("HistoricalEvent")).toBe(false);
  });
});
