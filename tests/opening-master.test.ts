import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { createConnectedBackgroundCutout } from "@/lib/opening/cutout";
import { buildOpeningFfmpegArgs, OPENING_AUDIO_MIX } from "@/lib/opening/ffmpeg";
import {
  OPENING_MASTER_KEY,
  OPENING_MASTER_METADATA,
  OPENING_MASTER_VERSION,
  WATCH_REVEAL_TEMPLATE,
  openingPreviewObjectKey,
  openingWatchObjectKey,
} from "@/lib/opening/template";

describe("POWER WATCH fixed opening master", () => {
  it("uses the Human master as immutable watchless version 3", () => {
    expect(OPENING_MASTER_KEY).toBe("POWER_WATCH_OPENING_MASTER");
    expect(OPENING_MASTER_VERSION).toBe(3);
    expect(OPENING_MASTER_METADATA.totalDurationSeconds).toBe(15.041);
    expect(OPENING_MASTER_METADATA.audioReusePolicy).toBe("fixed-original-audio-natural-tail-no-added-click");
    expect(OPENING_MASTER_METADATA.watchRevealStartSeconds).toBe(9.25);
  });

  it("composites only the watch region and preserves the fixed audio master", () => {
    const args = buildOpeningFfmpegArgs({
      watchlessMaster: "opening-master/watchless-master.mp4",
      watchCutouts: [{ path: "pierce.png", role: "front" }],
      audioMaster: "opening-master/audio-master-v3.wav",
      output: "preview.mp4",
    });
    expect(args).toContain("opening-master/watchless-master.mp4");
    expect(args).toContain("opening-master/audio-master-v3.wav");
    const filters = args[args.indexOf("-filter_complex") + 1];
    expect(filters).toContain(`between(t,${WATCH_REVEAL_TEMPLATE.transform.startSeconds}`);
    expect(filters).toContain("perspective=");
    expect(filters).toContain("[foreground]overlay");
    expect(filters).toContain(`fade=t=out:st=${OPENING_MASTER_METADATA.blackoutStartSeconds}`);
    expect(filters).not.toMatch(/drawtext|narration|runway/i);
    expect(args).toContain(OPENING_AUDIO_MIX.aacBitrate);
  });

  it("removes only edge-connected black while preserving enclosed black dial pixels", async () => {
    const rgba = Buffer.alloc(5 * 5 * 4, 0);
    for (let i = 0; i < 25; i += 1) rgba[i * 4 + 3] = 255;
    const set = (x: number, y: number, value: number) => {
      const offset = (y * 5 + x) * 4;
      rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = value;
    };
    for (let x = 1; x <= 3; x += 1) { set(x, 1, 220); set(x, 3, 220); }
    for (let y = 1; y <= 3; y += 1) { set(1, y, 220); set(3, y, 220); }
    const input = await sharp(rgba, { raw: { width: 5, height: 5, channels: 4 } }).png().toBuffer();
    const cutout = await createConnectedBackgroundCutout(new Uint8Array(input));
    const { data } = await sharp(cutout).raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0);
    expect(data[(2 * 5 + 2) * 4 + 3]).toBe(255);
  });

  it("uses stable project-specific output paths", () => {
    expect(openingWatchObjectKey("p", "x")).toBe("projects/p/opening-previews/x/watch-cutout.png");
    expect(openingPreviewObjectKey("p", "x")).toBe("projects/p/opening-previews/x.mp4");
  });
});
