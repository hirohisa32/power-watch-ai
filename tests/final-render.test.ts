import { describe, expect, it } from "vitest";
import { buildAudioRecord } from "@/lib/audio/record";
import { buildNarrationScript, buildSubtitleCues, narrationSpeed } from "@/lib/audio/timing";
import { createAssSubtitles } from "@/lib/render/ass";
import { buildFfmpegArgs } from "@/lib/render/ffmpeg";
import { buildFinalRenderInput, narrationObjectKey, renderObjectKey } from "@/lib/render/plan";
import { canRetryRender, nextRenderState } from "@/lib/render/state";

const scenes = [
  {
    sceneId: "scene-b",
    generationId: "generation-b",
    order: 3,
    preset: "WatchReveal",
    duration: 4,
    narration: "精密な時間が動き出す。",
    subtitle: "精密な時間が動き出す。",
    year: "1967",
    location: "BOLIVIA",
    objectKey: "b.mp4",
  },
  {
    sceneId: "scene-book",
    generationId: "generation-book",
    order: 2,
    preset: "OldBook",
    transition: "Short dissolve",
    duration: 4,
    narration: "机の上に、一冊の本が残されていた。",
    subtitle: "INTERNAL BOOK SHOT",
    year: null,
    location: null,
    objectKey: "book.mp4",
  },
  {
    sceneId: "scene-a",
    generationId: "generation-a",
    order: 1,
    preset: "Opening",
    duration: 3,
    narration: "時間は受け継がれる。",
    subtitle: "時間は受け継がれる。",
    year: null,
    location: null,
    objectKey: "a.mp4",
  },
];

describe("Phase 4 final render", () => {
  it("builds one normalized narration request in scene order", () => {
    const plan = buildFinalRenderInput({
      language: "ja",
      bgmKey: "default-ambient",
      scenes,
      totalSceneCount: 3,
    });
    expect(
      buildNarrationScript(
        plan.scenes.map((scene) => ({ id: scene.sceneId, ...scene })),
        "ja",
      ),
    ).toContain("時間は受け継がれる。");
    expect(narrationSpeed("時間は受け継がれる。", 3, "ja")).toBeLessThanOrEqual(1.2);
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

  it("adds POWER WATCH only on the closed-book scene and year/location overlays", () => {
    const plan = buildFinalRenderInput({
      language: "ja",
      bgmKey: "default-ambient",
      scenes,
      totalSceneCount: 3,
    });
    const brand = plan.overlays.find((item) => item.primary === "POWER WATCH");
    expect(brand).toBeDefined();
    expect(brand!.startMs).toBeGreaterThan(3000);
    expect(brand!.endMs).toBeLessThanOrEqual(7000);
    expect(
      plan.overlays.some((item) => item.primary === "1967" && item.secondary === "BOLIVIA"),
    ).toBe(true);
  });

  it("keeps subtitles inside the vertical safe area with Japanese font", () => {
    const plan = buildFinalRenderInput({
      language: "ja",
      bgmKey: "default-ambient",
      scenes,
      totalSceneCount: 3,
    });
    const ass = createAssSubtitles(plan);
    expect(ass).toContain("Noto Sans JP");
    expect(ass).toContain("MarginV");
    expect(ass).toContain(",330,1");
    expect(ass).not.toContain("INTERNAL BOOK SHOT");
  });

  it("orders scene concatenation and configures narration ducking", () => {
    const plan = buildFinalRenderInput({
      language: "ja",
      bgmKey: "default-ambient",
      scenes,
      totalSceneCount: 3,
    });
    expect(plan.scenes.map((scene) => scene.sceneId)).toEqual(["scene-a", "scene-book", "scene-b"]);
    const args = buildFfmpegArgs(
      plan,
      {
        videos: ["a.mp4", "book.mp4", "b.mp4"],
        narration: "n.mp3",
        subtitles: "s.ass",
        output: "o.mp4",
      },
      "/fonts",
    );
    const filters = args[args.indexOf("-filter_complex") + 1];
    expect(filters).toContain("concat=n=3");
    expect(args.filter((value) => value === "-stream_loop")).toHaveLength(3);
    expect(filters).toContain("fade=t=out");
    expect(filters).not.toContain("xfade=");
    expect(filters).toContain("sidechaincompress");
    expect(filters).toContain("loudnorm");
  });

  it("creates the final render input contract", () => {
    const plan = buildFinalRenderInput({
      language: "ja",
      bgmKey: "default-ambient",
      scenes,
      totalSceneCount: 4,
    });
    expect(plan).toMatchObject({
      width: 1080,
      height: 1920,
      fps: 30,
      totalDuration: 11,
      missingSceneCount: 1,
    });
  });

  it("uses valid render status transitions and allows failed retry", () => {
    expect(nextRenderState("queued", "start")).toBe("rendering");
    expect(nextRenderState("rendering", "complete")).toBe("completed");
    expect(nextRenderState("rendering", "fail")).toBe("failed");
    expect(canRetryRender("failed")).toBe(true);
  });

  it("uses the required R2 paths", () => {
    expect(narrationObjectKey("p", "a")).toBe("projects/p/audio/narration/a.mp3");
    expect(renderObjectKey("p", "r")).toBe("projects/p/renders/r.mp4");
  });
});
