import { describe, expect, it } from "vitest";
import { buildAudioRecord } from "@/lib/audio/record";
import { buildNarrationScript, buildSubtitleCues, narrationSpeed } from "@/lib/audio/timing";
import { createAssSubtitles } from "@/lib/render/ass";
import {
  buildDocumentaryEndingTransitionArgs,
  buildLuxuryEndingTextAnimationArgs,
  buildFixedOpeningConcatArgs,
  buildFfmpegArgs,
  buildSceneRetimeArgs,
  buildCompatibilityConcatArgs,
  buildTransportStreamArgs,
  buildPrimingTrimArgs,
  buildOpeningCompatibilityArgs,
} from "@/lib/render/ffmpeg";
import {
  buildFinalRenderInput,
  narrationObjectKey,
  renderObjectKey,
  scaleSceneDurationsToNarration,
  scaleTextOverlays,
} from "@/lib/render/plan";
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
    openingAsset: {
      id: "opening-power-watch",
      key: "opening_power_watch",
      storagePath: "system-assets/opening/opening_power_watch.mp4",
      duration: 15.07,
      width: 1080,
      height: 1920,
      fps: 24,
      hasAudio: true,
    },
    endingAsset: null,
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
    expect(render.overlays.some((item) => item.primary === "1967")).toBe(true);
  });

  it("encodes only the body to the master codec and stream-copies the fixed Opening", () => {
    const render = plan();
    const files = {
      opening: "assets/opening/opening-master.mp4",
      videos: ["history.mp4", "ending.mp4"],
      videoDurations: [4, 5],
      narration: "n.mp3",
      bgm: "approved-bgm.mp3",
      subtitles: "s.ass",
      output: "final.mp4",
    };
    const args = buildFfmpegArgs(render, files, "/fonts", "body.mp4");
    const filters = args[args.indexOf("-filter_complex") + 1];
    expect(filters).toContain("concat=n=2");
    expect(filters).toContain("fps=30");
    expect(filters).toContain("tpad=stop_mode=clone:stop_duration=0.1");
    expect(filters).toContain(
      "format=yuv420p10le,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=0.1,trim=duration=5",
    );
    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");
    expect(args.filter((item) => item === "-stream_loop")).toHaveLength(1);
    expect(args).not.toContain(files.opening);
    expect(args).toContain(files.bgm);
    expect(args.join(" ")).not.toContain("aevalsrc='(0.018*sin");
    expect(filters).toContain("afade=t=out");
    expect(filters).toContain("sidechaincompress");

    const openingCompatibility = buildOpeningCompatibilityArgs(files.opening, "opening.mp4", 24);
    expect(openingCompatibility).toContain("libx264");
    expect(openingCompatibility).toContain("aac");

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

  it("retimes an extended scene before the multi-scene concat", () => {
    const args = buildSceneRetimeArgs("scene.mp4", "prepared.mp4", 30, 5, 6.5);
    expect(args).toContain("fps=30,setpts=PTS-STARTPTS,setpts=1.30000000*PTS,tpad=stop_mode=clone:stop_duration=0.1,trim=duration=6.5,setpts=PTS-STARTPTS");
    expect(args).toContain("veryfast");
    expect(args).toContain("prepared.mp4");
  });

  it("uses concise approved subtitles instead of the full narration", () => {
    const cues = buildSubtitleCues([
      {
        id: "s",
        duration: 4,
        narration: "これは表示しない長いナレーションです。",
        subtitle: "GOLD KHANJAR",
      },
    ]);
    expect(cues.map((cue) => cue.text)).toEqual(["GOLD KHANJAR"]);
  });

  it("removes narration subtitles and keeps only concise evidence overlays when disabled", () => {
    const input = buildFinalRenderInput({
      language: "ja",
      bgmKey: "approved",
      totalSceneCount: 1,
      narrationSubtitlesEnabled: false,
      scenes: [
        {
          ...scenes[2],
          subtitle: "CALIBRE 478",
          narration: "1945年、ルクルトが生んだ名機です。",
        },
      ],
    });
    expect(input.subtitles).toEqual([]);
    expect(input.overlays).toContainEqual(
      expect.objectContaining({ kind: "evidence", primary: "CALIBRE 478" }),
    );
  });

  it("keeps the approved scene rhythm when narration subtitles are disabled", () => {
    const synchronized = scaleSceneDurationsToNarration(
      [{ duration: 6 }, { duration: 7 }, { duration: 4 }, { duration: 5 }],
      20_000,
    );

    expect(synchronized.reduce((sum, scene) => sum + scene.duration, 0)).toBeCloseTo(20, 6);
    expect(synchronized.map((scene) => scene.duration)).toEqual([
      expect.closeTo(5.4545, 3),
      expect.closeTo(6.3636, 3),
      expect.closeTo(3.6364, 3),
      expect.closeTo(4.5455, 3),
    ]);
  });

  it("keeps evidence overlays on the scaled scene timeline", () => {
    expect(scaleTextOverlays([{ startMs: 5_000, endMs: 8_000 }], 0.8)).toEqual([
      { startMs: 4_000, endMs: 6_400 },
    ]);
  });

  it("records the immutable master and zero Opening credits", () => {
    expect(plan()).toMatchObject({
      width: 1080,
      height: 1920,
      fps: 30,
      totalDuration: 24.07,
      missingSceneCount: 0,
      openingAsset: {
        key: "opening_power_watch",
        storagePath: "system-assets/opening/opening_power_watch.mp4",
      },
      endingAsset: null,
    });
  });

  it("builds a restrained deep-brown documentary ending transition", () => {
    const args = buildDocumentaryEndingTransitionArgs({
      source: "product.mp4",
      output: "transitioned.mp4",
      totalDuration: 25,
      transitionDuration: 1.2,
    });
    const filter = args[args.indexOf("-vf") + 1];
    expect(filter).toContain("st=23.800");
    expect(filter).toContain("d=1.200");
    expect(filter).toContain("color=0x120B07");
    expect(args.slice(args.indexOf("-c:a"), args.indexOf("-c:a") + 2)).toEqual(["-c:a", "copy"]);
  });

  it("uses a quadratic ease envelope for the luxury ending text", () => {
    const args = buildLuxuryEndingTextAnimationArgs({
      source: "ending.mp4",
      output: "ending-eased.mp4",
      duration: 5,
      fadeDuration: 1.5,
    });
    const filter = args[args.indexOf("-vf") + 1];
    expect(filter.match(/fade=t=in/g)).toHaveLength(2);
    expect(filter.match(/fade=t=out/g)).toHaveLength(2);
    expect(filter).toContain("st=3.500:d=1.500");
    expect(filter).toContain("fps=15");
    expect(args.slice(args.indexOf("-r"), args.indexOf("-r") + 2)).toEqual(["-r", "15"]);
    expect(args).not.toContain("scale");
  });

  it("uses valid render status transitions and stable output paths", () => {
    expect(nextRenderState("queued", "start")).toBe("rendering");
    expect(nextRenderState("rendering", "complete")).toBe("completed");
    expect(canRetryRender("failed")).toBe(true);
    expect(narrationObjectKey("p", "a")).toBe("projects/p/audio/narration/a.mp3");
    expect(renderObjectKey("p", "r")).toBe("projects/p/renders/r.mp4");
  });
});
