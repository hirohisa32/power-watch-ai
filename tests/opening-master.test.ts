import { describe, expect, it } from "vitest";
import { buildOpeningFfmpegArgs, OPENING_AUDIO_MIX } from "@/lib/opening/ffmpeg";
import {
  OPENING_MASTER_KEY,
  OPENING_MASTER_PROMPTS,
  masterSegmentObjectKey,
  openingPreviewObjectKey,
  openingWatchObjectKey,
  watchRevealPrompt,
} from "@/lib/opening/prompts";

describe("POWER WATCH fixed opening master", () => {
  it("locks the photorealistic fixed world into three reusable segments", () => {
    expect(OPENING_MASTER_KEY).toBe("POWER_WATCH_OPENING_MASTER");
    expect(OPENING_MASTER_PROMPTS).toHaveLength(3);
    expect(OPENING_MASTER_PROMPTS.join(" ")).toMatch(/centuries-old heavy wooden door/i);
    expect(OPENING_MASTER_PROMPTS.join(" ")).toMatch(/tall shelves packed with many aged books/i);
    expect(OPENING_MASTER_PROMPTS.join(" ")).toMatch(/antique wooden desk/i);
    expect(OPENING_MASTER_PROMPTS.join(" ")).toMatch(/dust/i);
    expect(OPENING_MASTER_PROMPTS.join(" ")).toMatch(/no visible text/i);
  });

  it("keeps the supplied watch identity constraints in the variable segment", () => {
    const prompt = watchRevealPrompt();
    expect(prompt).toMatch(/exact supplied real vintage wristwatch/i);
    expect(prompt).toContain("PIERCE marking");
    expect(prompt).toMatch(/no invented watch/i);
  });

  it("puts POWER WATCH into post production only during the book shot", () => {
    const args = buildOpeningFfmpegArgs(
      {
        videos: ["door.mp4", "room.mp4", "book.mp4", "watch.mp4"],
        narration: "narration.mp3",
        output: "preview.mp4",
      },
      "/fonts",
    );
    const filters = args[args.indexOf("-filter_complex") + 1];
    expect(filters).toContain("text='POWER WATCH'");
    expect(filters).toContain("between(t,11.1,13.8)");
    expect(filters.match(/POWER WATCH/g)).toHaveLength(1);
  });

  it("creates an audible AAC stereo mix with narration ducking", () => {
    const args = buildOpeningFfmpegArgs(
      {
        videos: ["a", "b", "c", "d"],
        narration: "n",
        output: "o",
      },
      "/fonts",
    );
    const filters = args[args.indexOf("-filter_complex") + 1];
    expect(filters).toContain("sidechaincompress");
    expect(filters).toContain(`loudnorm=I=${OPENING_AUDIO_MIX.narrationTargetLufs}`);
    expect(args).toContain("aac");
    expect(args).toContain("192k");
    expect(args).toContain("2");
  });

  it("uses shared master and project-specific R2 paths", () => {
    expect(masterSegmentObjectKey(0)).toBe(
      "brand/openings/power-watch-opening-master/v1/segments/01.mp4",
    );
    expect(openingWatchObjectKey("p", "x")).toBe("projects/p/opening-previews/x/watch.mp4");
    expect(openingPreviewObjectKey("p", "x")).toBe("projects/p/opening-previews/x.mp4");
  });
});
