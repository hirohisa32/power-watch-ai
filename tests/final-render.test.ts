import { describe, expect, it } from "vitest";
import { buildAudioRecord } from "@/lib/audio/record";
import { buildNarrationScript, buildSubtitleCues, narrationSpeed } from "@/lib/audio/timing";
import { createAssSubtitles } from "@/lib/render/ass";
import {
  buildFixedOpeningConcatArgs,
  buildFfmpegArgs,
  buildCompatibilityConcatArgs,
  buildTransportStreamArgs,
  buildPrimingTrimArgs,
} from "@/lib/render/ffmpeg";
import { buildFinalRenderInput, narrationObjectKey, renderObjectKey } from "@/lib/render/plan";
import { canRetryRender, nextRenderState } from "@/lib/render/state";

const scenes = [
  {
    sceneId: "opening",
    generationId: "old-opening-generation",
    order: 1,
    preset: "Opening",
    duration: 3,
    narration: "固定Openingでは使用しない。",
    subtitle: "固定Openingでは使用しない。",
    year: null,
    location: null,
    objectKey: "old-opening.mp4",
  },
  {
    sceneId: "book",
    generationId: "old-book-generation",
    order: 2,
    preset: "OldBook",
    duration: 3,
    narration: "固定Openingでは使用しない。",
    subtitle: "固定Openingでは使用しない。",
    year: null,
    location: null,
    objectKey: "old-book.mp4",
  },
  {
    sceneId: "history",
    generationId: "history-generation",
    order: 5,
    preset: "HistoricalEvent",
    transition: "Short dissolve",
    duration: 5,
    narration: "時計の歴史をたどる。",
    subtitle: "時計の歴史をたどる。",
    year: "1967",
    location: "BOLIVIA",
    objectKey: "history.mp4",
  },
  {
    sceneId: "ending",
    generationId: "ending-generation",
    order: 6,
    preset: "Ending",
    duration: 4,
    narration: "時を、記憶する。",
    subtitle: "時を、記憶する。",
    year: null,
    location: null,
    objectKey: "ending.mp4",
  },
];

function plan() {
  return buildFinalRenderInput({
    language: "ja",
    bgmKey: "default-ambient",
    scenes,
    totalSceneCount: 2,
  });
}

describe("fixed Opening final render", () => {
  it("excludes legacy Opening scenes from narration and body rendering", () => {
    const render = plan();
    expect(render.scenes.map((scene) => scene.sceneId)).toEqual(["history", "ending"]);
    expect(
      buildNarrationScript(
        render.scenes.map((scene) => ({ id: scene.sceneId, ...scene })),
        "ja",
      ),
    ).not.toContain("固定Opening");
    expect(narrationSpeed("時計の歴史をたどる。", 5, "ja")).toBeLessThanOrEqual(1.2);
  });

  it("creates a persisted audio record shape", () => {
    expect(
      buildAudioRecord({
        projectId: "p",
        storyboardId: "s",
        provider: "elevenlabs",
        model: "eleven_multilingual_v2",
        voiceId: "voice",
        language: "ja",
        script: "時計",
      }),
    ).toMatchObject({ characterCount: 2, provider: "elevenlabs" });
  });

  it("creates sentence subtitle timing within scene boundaries", () => {
    const cues = buildSubtitleCues([
      { id: "s", duration: 4, narration: "A。B。", subtitle: "A。B。" },
    ]);
    expect(cues).toHaveLength(2);
    expect(cues[0].startMs).toBeGreaterThan(0);
    expect(cues[1].endMs).toBeLessThan(4000);
    expect(cues[0].endMs).toBeLessThanOrEqual(cues[1].startMs);
  });

  it("keeps subtitles and body overlays local to the body timeline", () => {
    const render = plan();
    const ass = createAssSubtitles(render);
    expect(ass).toContain("Noto Sans JP");
    expect(render.overlays.some((item) => item.primary === "1967")).toBe(true);
    expect(render.overlays.some((item) => item.primary === "POWER WATCH")).toBe(true);
  });

  it("encodes only the body to the master codec and stream-copies the fixed Opening", () => {
    const render = plan();
    const files = {
      opening: "assets/opening/opening-master.mp4",
      videos: ["history.mp4", "ending.mp4"],
      narration: "n.mp3",
      bgm: "approved-bgm.mp3",
      subtitles: "s.ass",
      output: "final.mp4",
    };
    const args = buildFfmpegArgs(render, files, "/fonts", "body.mp4");
    const filters = args[args.indexOf("-filter_complex") + 1];
    expect(filters).toContain("concat=n=2");
    expect(filters).toContain("fps=24");
    expect(args).toContain("libx265");
    expect(args).toContain("yuv420p10le");
    expect(args).not.toContain(files.opening);
    expect(args).toContain(files.bgm);
    expect(args.join(" ")).not.toContain("aevalsrc='(0.018*sin");

    const remux = buildTransportStreamArgs(files.opening, "opening.ts");
    expect(remux).toContain("hevc_mp4toannexb");
    expect(remux.slice(remux.indexOf("-c"), remux.indexOf("-c") + 2)).toEqual(["-c", "copy"]);

    const compatibilityConcat = buildCompatibilityConcatArgs("concat.txt", "combined.mp4");
    expect(
      compatibilityConcat.slice(
        compatibilityConcat.indexOf("-c"),
        compatibilityConcat.indexOf("-c") + 2,
      ),
    ).toEqual(["-c", "copy"]);
    const trimMedia = buildPrimingTrimArgs("raw.mp4", "combined.mp4");
    expect(trimMedia).toContain("0.032");
    expect(trimMedia.slice(trimMedia.indexOf("-c"), trimMedia.indexOf("-c") + 2)).toEqual([
      "-c",
      "copy",
    ]);

    const concat = buildFixedOpeningConcatArgs(files, "combined.ts", "audio.m4a");
    expect(concat.slice(concat.indexOf("-c"), concat.indexOf("-c") + 2)).toEqual(["-c", "copy"]);
    expect(concat).not.toContain("-filter_complex");
  });

  it("records the immutable master and zero Opening credits", () => {
    expect(plan()).toMatchObject({
      width: 1080,
      height: 1920,
      fps: 24,
      totalDuration: 24.07,
      missingSceneCount: 0,
      fixedOpening: {
        version: 4,
        systemAsset: "assets/opening/opening-master.mp4",
        credits: 0,
      },
    });
  });

  it("uses valid render status transitions and stable output paths", () => {
    expect(nextRenderState("queued", "start")).toBe("rendering");
    expect(nextRenderState("rendering", "complete")).toBe("completed");
    expect(canRetryRender("failed")).toBe(true);
    expect(narrationObjectKey("p", "a")).toBe("projects/p/audio/narration/a.mp3");
    expect(renderObjectKey("p", "r")).toBe("projects/p/renders/r.mp4");
  });
});
