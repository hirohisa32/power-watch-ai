import { spawn } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FinalRenderInput } from "./types";
import { SOUND_EFFECT_BY_PRESET } from "./plan";

export type FfmpegRenderFiles = {
  opening?: string;
  ending?: string;
  videos: string[];
  videoDurations?: number[];
  narration: string;
  bgm: string;
  subtitles: string;
  output: string;
};

export function buildFfmpegArgs(
  input: FinalRenderInput,
  files: FfmpegRenderFiles,
  fontDirectory: string,
  bodyOutput = files.output,
  preset = "medium",
  fadeBgmAtBodyEnd = true,
  audioOffsetSeconds = 0,
) {
  const bodyDuration = input.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const args = ["-y", "-hide_banner", "-loglevel", "warning"];
  // Keep inputs finite. The per-scene tpad below must observe EOF so it can fill
  // only that scene's missing frames instead of leaving the final frame held.
  files.videos.forEach((video) => args.push("-i", video));
  const narrationIndex = files.videos.length;
  const bgmIndex = narrationIndex + 1;
  const seIndex = narrationIndex + 2;
  args.push("-i", files.narration);
  args.push("-stream_loop", "-1", "-i", files.bgm);
  args.push("-f", "lavfi", "-t", String(bodyDuration), "-i", buildSoundEffectSource(input));

  const videoFilters = input.scenes.map((scene, index) => {
    const incoming = index > 0 ? transitionFadeSeconds(input.scenes[index - 1].transition) : 0;
    const outgoing =
      index < input.scenes.length - 1
        ? transitionFadeSeconds(scene.transition)
        : input.endingAsset
          ? Math.min(0.5, Math.max(0.3, transitionFadeSeconds(scene.transition)))
          : 0;
    const fades = [
      incoming > 0 ? `fade=t=in:st=0:d=${incoming}` : "",
      outgoing > 0
        ? `fade=t=out:st=${Math.max(0, scene.duration - outgoing).toFixed(3)}:d=${outgoing}${index === input.scenes.length - 1 && input.endingAsset ? ":color=0x120B07" : ""}`
        : "",
    ].filter(Boolean);
    return `[${index}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=${input.fps},format=yuv420p10le,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=0.1,trim=duration=${scene.duration},setpts=PTS-STARTPTS${fades.length ? `,${fades.join(",")}` : ""}[v${index}]`;
  });
  const concat = `${input.scenes.map((_, index) => `[v${index}]`).join("")}concat=n=${input.scenes.length}:v=1:a=0[base]`;
  const subtitle = `[base]subtitles=filename='${escapeFilterPath(files.subtitles)}':fontsdir='${escapeFilterPath(fontDirectory)}'[vout]`;
  const audioEnd = audioOffsetSeconds + bodyDuration;
  const audio = [
    `[${narrationIndex}:a]atrim=start=${audioOffsetSeconds}:end=${audioEnd},asetpts=PTS-STARTPTS,apad,loudnorm=I=-16:TP=-1.5:LRA=11,aformat=sample_fmts=fltp:sample_rates=32000:channel_layouts=stereo,asplit=2[narrmix][side]`,
    `[${bgmIndex}:a]atrim=start=${audioOffsetSeconds}:end=${audioEnd},asetpts=PTS-STARTPTS,highpass=f=35,lowpass=f=12000,loudnorm=I=-23:TP=-2:LRA=11${fadeBgmAtBodyEnd ? `,afade=t=out:st=${Math.max(0, bodyDuration - 1.5).toFixed(3)}:d=1.5` : ""},aformat=sample_fmts=fltp:sample_rates=32000:channel_layouts=stereo[bgm]`,
    `[bgm][side]sidechaincompress=threshold=0.02:ratio=5:attack=35:release=650:makeup=1[ducked]`,
    `[${seIndex}:a]highpass=f=40,lowpass=f=7000,volume=0.11[se]`,
    `[narrmix][ducked][se]amix=inputs=3:duration=longest,alimiter=limit=0.92,loudnorm=I=-14:TP=-1.0:LRA=10[aout]`,
  ];
  args.push("-filter_complex", [...videoFilters, concat, subtitle, ...audio].join(";"));
  args.push(
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-t",
    String(bodyDuration),
    "-r",
    String(input.fps),
    "-c:v",
    "libx264",
    "-preset",
    preset,
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-video_track_timescale",
    "12288",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "32000",
    "-movflags",
    "+faststart",
    bodyOutput,
  );
  return args;
}

export function buildFixedOpeningConcatArgs(
  files: FfmpegRenderFiles,
  combinedTransportStream: string,
  combinedAudio: string,
) {
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "warning",
    "-fflags",
    "+genpts",
    "-i",
    combinedTransportStream,
    "-i",
    combinedAudio,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    files.output,
  ];
}

export function buildCompatibilityConcatArgs(concatList: string, output: string) {
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "warning",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatList,
    "-c",
    "copy",
    output,
  ];
}

export function buildOpeningCompatibilityArgs(input: string, output: string, fps: number) {
  return buildSystemMediaCompatibilityArgs(input, output, fps, undefined, true);
}

export function buildSceneRetimeArgs(
  input: string,
  output: string,
  fps: number,
  sourceDuration: number,
  targetDuration: number,
) {
  const ratio = targetDuration / sourceDuration;
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "warning",
    "-i",
    input,
    "-vf",
    `fps=${fps},setpts=PTS-STARTPTS,setpts=${ratio.toFixed(8)}*PTS,tpad=stop_mode=clone:stop_duration=0.1,trim=duration=${targetDuration},setpts=PTS-STARTPTS`,
    "-an",
    "-t",
    String(targetDuration),
    "-r",
    String(fps),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    output,
  ];
}

export function buildSystemMediaCompatibilityArgs(
  input: string,
  output: string,
  fps: number,
  duration: number | undefined,
  hasAudio: boolean,
  preset = "medium",
  startSeconds = 0,
  luxuryFade = false,
) {
  const audioInput = hasAudio
    ? []
    : [
        "-f",
        "lavfi",
        ...(duration ? ["-t", String(duration)] : []),
        "-i",
        "anullsrc=r=32000:cl=stereo",
      ];
  const videoFilter = [
    `scale=1080:1920:force_original_aspect_ratio=increase`,
    "crop=1080:1920",
    `fps=${fps}`,
    ...(luxuryFade && duration
      ? [
          `fade=t=in:st=0:d=${Math.min(0.9, duration / 3).toFixed(3)}:color=0x120B07`,
          `fade=t=out:st=${Math.max(0, duration - Math.min(0.9, duration / 3)).toFixed(3)}:d=${Math.min(0.9, duration / 3).toFixed(3)}:color=0x120B07`,
        ]
      : []),
    "format=yuv420p",
  ].join(",");
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "warning",
    ...(startSeconds > 0 ? ["-ss", String(startSeconds)] : []),
    "-i",
    input,
    ...audioInput,
    ...(duration ? ["-t", String(duration)] : []),
    "-vf",
    videoFilter,
    "-r",
    String(fps),
    "-map",
    "0:v:0",
    "-map",
    hasAudio ? "0:a:0" : "1:a:0",
    "-c:v",
    "libx264",
    "-preset",
    preset,
    "-crf",
    "18",
    "-video_track_timescale",
    "12288",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "32000",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    output,
  ];
}

export function buildPrimingTrimArgs(input: string, output: string) {
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "warning",
    "-ss",
    "0.032",
    "-i",
    input,
    "-c",
    "copy",
    output,
  ];
}

export function buildTransportStreamArgs(input: string, output: string) {
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "warning",
    "-i",
    input,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-c",
    "copy",
    "-bsf:v",
    "hevc_mp4toannexb",
    "-f",
    "mpegts",
    output,
  ];
}

export async function renderWithFfmpeg(
  input: FinalRenderInput,
  files: FfmpegRenderFiles,
  fontDirectory = resolveFontDirectory(),
  preset = "medium",
  fadeBgmAtBodyEnd = true,
  audioOffsetSeconds = 0,
) {
  const executable = resolveFfmpegPath();
  const bodyOutput = path.join(path.dirname(files.output), "body-master-compatible.mp4");
  const openingCompatible = path.join(
    path.dirname(files.output),
    "selected-opening-compatible.mp4",
  );
  const endingCompatible = path.join(path.dirname(files.output), "selected-ending-compatible.mp4");
  const concatList = path.join(path.dirname(files.output), "system-media-concat.txt");
  const combinedOutput = path.join(path.dirname(files.output), "combined-before-ending-bgm.mp4");
  const preparedVideos: string[] = [];
  try {
    const bodyVideos = [...files.videos];
    for (const [index, scene] of input.scenes.entries()) {
      const sourceDuration = files.videoDurations?.[index];
      if (!sourceDuration) continue;
      const prepared = path.join(path.dirname(files.output), `scene-${index}-retimed.mp4`);
      await run(
        executable,
        buildSceneRetimeArgs(
          files.videos[index],
          prepared,
          input.fps,
          sourceDuration,
          scene.duration,
        ),
        180_000,
      );
      bodyVideos[index] = prepared;
      preparedVideos.push(prepared);
    }
    const bodyFiles = { ...files, videos: bodyVideos };
    await run(
      executable,
      buildFfmpegArgs(
        input,
        bodyFiles,
        fontDirectory,
        bodyOutput,
        preset,
        fadeBgmAtBodyEnd && !input.endingAsset,
        audioOffsetSeconds,
      ),
      600_000,
    );
    const segments: string[] = [];
    if (files.opening && input.openingAsset) {
      await run(
        executable,
        buildSystemMediaCompatibilityArgs(
          files.opening,
          openingCompatible,
          input.fps,
          input.openingAsset.duration,
          input.openingAsset.hasAudio,
        ),
        180_000,
      );
      segments.push(openingCompatible);
    }
    segments.push(bodyOutput);
    if (files.ending && input.endingAsset) {
      const endingDuration = input.endingAsset.recommendedDuration ?? input.endingAsset.duration;
      await run(
        executable,
        buildSystemMediaCompatibilityArgs(
          files.ending,
          endingCompatible,
          input.fps,
          endingDuration,
          input.endingAsset.hasAudio,
          preset,
          input.endingAsset.recommendedStart ?? 0,
          true,
        ),
        180_000,
      );
      segments.push(endingCompatible);
    }
    if (segments.length === 1) {
      const { copyFile } = await import("node:fs/promises");
      await copyFile(bodyOutput, files.output);
      return;
    }
    await writeFile(
      concatList,
      segments
        .map((file) => `file '${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
        .join("\n"),
      "utf8",
    );
    const concatenatedOutput = input.endingAsset ? combinedOutput : files.output;
    await run(executable, buildCompatibilityConcatArgs(concatList, concatenatedOutput), 90_000);
    if (input.endingAsset) {
      await continueBgmThroughEnding({
        video: combinedOutput,
        bgm: files.bgm,
        output: files.output,
        openingDuration: input.openingAsset?.duration ?? 0,
        bodyDuration: input.scenes.reduce((sum, scene) => sum + scene.duration, 0),
        endingDuration: input.endingAsset.recommendedDuration ?? input.endingAsset.duration,
      });
    }
  } finally {
    await Promise.all([
      rm(bodyOutput, { force: true }),
      rm(openingCompatible, { force: true }),
      rm(endingCompatible, { force: true }),
      rm(concatList, { force: true }),
      rm(combinedOutput, { force: true }),
      ...preparedVideos.map((file) => rm(file, { force: true })),
    ]);
  }
}

export async function assemblePreparedRender(input: {
  bodySegments: string[];
  opening?: string;
  openingDuration?: number;
  openingHasAudio?: boolean;
  ending?: string;
  endingDuration?: number;
  endingHasAudio?: boolean;
  fps: number;
  output: string;
}) {
  const executable = resolveFfmpegPath();
  const directory = path.dirname(input.output);
  const openingCompatible = path.join(directory, "prepared-opening-compatible.mp4");
  const endingCompatible = path.join(directory, "prepared-ending-compatible.mp4");
  const concatList = path.join(directory, "prepared-render-concat.txt");
  try {
    const segments: string[] = [];
    if (input.opening && input.openingDuration) {
      await run(
        executable,
        buildSystemMediaCompatibilityArgs(
          input.opening,
          openingCompatible,
          input.fps,
          input.openingDuration,
          input.openingHasAudio ?? true,
          "ultrafast",
        ),
        180_000,
      );
      segments.push(openingCompatible);
    }
    segments.push(...input.bodySegments);
    if (input.ending && input.endingDuration) {
      await run(
        executable,
        buildSystemMediaCompatibilityArgs(
          input.ending,
          endingCompatible,
          input.fps,
          input.endingDuration,
          input.endingHasAudio ?? true,
          "ultrafast",
        ),
        180_000,
      );
      segments.push(endingCompatible);
    }
    await writeFile(
      concatList,
      segments
        .map((file) => `file '${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
        .join("\n"),
      "utf8",
    );
    await run(executable, buildCompatibilityConcatArgs(concatList, input.output), 90_000);
  } finally {
    await Promise.all([
      rm(openingCompatible, { force: true }),
      rm(endingCompatible, { force: true }),
      rm(concatList, { force: true }),
    ]);
  }
}

export async function normalizeSystemMedia(input: {
  source: string;
  output: string;
  fps: number;
  duration: number;
  hasAudio: boolean;
  preset?: string;
}) {
  await run(
    resolveFfmpegPath(),
    buildSystemMediaCompatibilityArgs(
      input.source,
      input.output,
      input.fps,
      input.duration,
      input.hasAudio,
      input.preset ?? "ultrafast",
    ),
    270_000,
  );
}

export function buildDocumentaryEndingTransitionArgs(input: {
  source: string;
  output: string;
  totalDuration: number;
  transitionDuration: number;
  preset?: string;
}) {
  const duration = Math.min(Math.max(input.transitionDuration, 0.1), input.totalDuration);
  const start = Math.max(0, input.totalDuration - duration);
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "warning",
    "-i",
    input.source,
    "-vf",
    `fade=t=out:st=${start.toFixed(3)}:d=${duration.toFixed(3)}:color=0x120B07`,
    "-c:v",
    "libx264",
    "-preset",
    input.preset ?? "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    input.output,
  ];
}

export async function applyDocumentaryEndingTransition(input: {
  source: string;
  output: string;
  totalDuration: number;
  transitionDuration: number;
  preset?: string;
}) {
  await run(resolveFfmpegPath(), buildDocumentaryEndingTransitionArgs(input), 180_000);
}

export function buildLuxuryEndingTextAnimationArgs(input: {
  source: string;
  output: string;
  duration: number;
  fadeDuration: number;
  preset?: string;
}) {
  const fadeDuration = Math.min(Math.max(input.fadeDuration, 0.1), input.duration / 2);
  const fadeOutStart = Math.max(0, input.duration - fadeDuration);
  const videoFilter = [
    "fps=15",
    `fade=t=in:st=0:d=${fadeDuration.toFixed(3)}:color=black`,
    `fade=t=in:st=0:d=${fadeDuration.toFixed(3)}:color=black`,
    `fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeDuration.toFixed(3)}:color=black`,
    `fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeDuration.toFixed(3)}:color=black`,
    "format=yuv420p",
  ].join(",");
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "warning",
    "-i",
    input.source,
    "-vf",
    videoFilter,
    "-t",
    input.duration.toFixed(3),
    "-r",
    "15",
    "-c:v",
    "libx264",
    "-preset",
    input.preset ?? "ultrafast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    input.output,
  ];
}

export async function applyLuxuryEndingTextAnimation(input: {
  source: string;
  output: string;
  duration: number;
  fadeDuration: number;
  preset?: string;
}) {
  await run(resolveFfmpegPath(), buildLuxuryEndingTextAnimationArgs(input), 180_000);
}

export async function mixBgmIntoEndingSegment(input: {
  video: string;
  bgm: string;
  output: string;
  bgmOffset: number;
  duration: number;
}) {
  const fadeDuration = Math.min(1.8, input.duration);
  const fadeStart = Math.max(0, input.duration - fadeDuration);
  const filter = [
    `[1:a]atrim=duration=${input.duration.toFixed(3)},asetpts=PTS-STARTPTS,highpass=f=35,lowpass=f=12000,volume=0.18,afade=t=out:st=${fadeStart.toFixed(3)}:d=${fadeDuration.toFixed(3)}[bgm]`,
    `[0:a][bgm]amix=inputs=2:duration=first,volume=2,atrim=duration=${input.duration.toFixed(3)},alimiter=limit=0.92[aout]`,
  ].join(";");
  await run(
    resolveFfmpegPath(),
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-i",
      input.video,
      "-ss",
      String(input.bgmOffset),
      "-t",
      String(input.duration),
      "-i",
      input.bgm,
      "-filter_complex",
      filter,
      "-map",
      "0:v:0",
      "-map",
      "[aout]",
      "-t",
      String(input.duration),
      "-shortest",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "32000",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      input.output,
    ],
    90_000,
  );
}

export async function continueBgmThroughEnding(input: {
  video: string;
  bgm: string;
  output: string;
  openingDuration: number;
  bodyDuration: number;
  endingDuration: number;
}) {
  const endingStart = input.openingDuration + input.bodyDuration;
  const fadeDuration = Math.min(1.25, input.endingDuration);
  const fadeStart = Math.max(0, input.endingDuration - fadeDuration);
  const delayMs = Math.round(endingStart * 1000);
  const totalDuration = endingStart + input.endingDuration;
  const filter = [
    `[1:a]asetpts=PTS-STARTPTS,highpass=f=35,lowpass=f=12000,loudnorm=I=-23:TP=-2:LRA=11,afade=t=out:st=${fadeStart.toFixed(3)}:d=${fadeDuration.toFixed(3)},adelay=${delayMs}|${delayMs}[bgmtail]`,
    `[0:a][bgmtail]amix=inputs=2:duration=first,volume=2,alimiter=limit=0.92[aout]`,
  ].join(";");
  await run(
    resolveFfmpegPath(),
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-i",
      input.video,
      "-ss",
      String(input.bodyDuration),
      "-t",
      String(input.endingDuration),
      "-i",
      input.bgm,
      "-filter_complex",
      filter,
      "-map",
      "0:v:0",
      "-map",
      "[aout]",
      "-t",
      String(totalDuration),
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "32000",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      input.output,
    ],
    120_000,
  );
}

export async function probeDurationMs(file: string) {
  const executable = resolveFfmpegPath();
  const output = await run(executable, ["-hide_banner", "-i", file], 30_000, true);
  const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Math.round((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000);
}

export async function concatSpeechAudio(files: string[], output: string, durations?: number[]) {
  if (!files.length) throw new Error("AUDIO_SEGMENTS_REQUIRED");
  if (files.length === 1 && !durations?.length) {
    const { copyFile } = await import("node:fs/promises");
    await copyFile(files[0], output);
    return;
  }
  const args = ["-y", "-hide_banner", "-loglevel", "warning"];
  files.forEach((file) => args.push("-i", file));
  const timedInputs = durations?.length
    ? files.map((_, index) => {
        const duration = durations[index] ?? durations.at(-1) ?? 1;
        return `[${index}:a]atrim=0:${duration},apad,atrim=0:${duration},asetpts=PTS-STARTPTS[a${index}]`;
      })
    : [];
  const inputs = files
    .map((_, index) => (durations?.length ? `[a${index}]` : `[${index}:a]`))
    .join("");
  args.push(
    "-filter_complex",
    `${timedInputs.length ? `${timedInputs.join(";")};` : ""}${inputs}concat=n=${files.length}:v=0:a=1,aresample=44100[aout]`,
    "-map",
    "[aout]",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    output,
  );
  await run(resolveFfmpegPath(), args, 120_000);
}

export function resolveFontDirectory() {
  return path.join(process.cwd(), ".vercel-build-assets", "fonts");
}

function resolveFfmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  return path.join(process.cwd(), ".vercel-build-assets", "ffmpeg");
}

function buildSoundEffectSource(input: FinalRenderInput) {
  let cursor = 0;
  const terms = input.scenes.flatMap((scene) => {
    const effect = SOUND_EFFECT_BY_PRESET[scene.preset];
    const start = cursor;
    cursor += scene.duration;
    if (!effect) return [];
    const effectDuration = scene.preset === "Racing" ? 1.25 : effect.key === "wind" ? 1 : 0.55;
    const end = Math.min(start + effectDuration, cursor);
    const elapsed = `(t-${start.toFixed(3)})`;
    if (scene.preset === "Racing")
      return [
        `(0.07*sin(2*PI*(${effect.frequency}+24*${elapsed})*t)+0.012*(2*random(0)-1))*between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})`,
      ];
    if (effect.key === "door")
      return [
        `(0.1*sin(2*PI*58*${elapsed})+0.018*(2*random(0)-1))*exp(-6*${elapsed})*between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})`,
      ];
    if (effect.key === "book")
      return [
        `0.032*(2*random(0)-1)*exp(-4*${elapsed})*between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})`,
      ];
    if (effect.key === "wind")
      return [
        `0.018*(2*random(0)-1)*(1-exp(-5*${elapsed}))*between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})`,
      ];
    return [
      `(0.045*sin(2*PI*${effect.frequency}*t)+0.012*(2*random(0)-1))*exp(-10*${elapsed})*between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})`,
    ];
  });
  return `aevalsrc='${terms.join("+") || "0"}':s=32000:c=stereo`;
}

export function transitionFadeSeconds(transition?: string) {
  return transitionSpec(transition).seconds;
}

export function transitionSpec(transition?: string) {
  const value = transition?.toLocaleLowerCase() ?? "";
  if (/ending|brand end/.test(value)) return { name: "fadeblack", seconds: 1 };
  if (/light|bloom|film burn|optical/.test(value)) return { name: "fadewhite", seconds: 0.12 };
  if (/dust|memory|fade to black/.test(value)) return { name: "fadeblack", seconds: 0.14 };
  if (/dissolve/.test(value)) return { name: "fade", seconds: 0.18 };
  if (/page wipe/.test(value)) return { name: "smoothleft", seconds: 0.1 };
  return { name: "cut", seconds: 0 };
}

function escapeFilterPath(value: string) {
  return value.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function run(executable: string, args: string[], timeoutMs: number, allowFailure = false) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    const timeout = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`FFMPEG_START_FAILED:${error.message}`));
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0 || allowFailure) resolve(output);
      else reject(new Error(`FFMPEG_FAILED:${output.slice(-1200)}`));
    });
  });
}
