import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FinalRenderInput } from "./types";
import { SOUND_EFFECT_BY_PRESET } from "./plan";

export type FfmpegRenderFiles = {
  opening: string;
  videos: string[];
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
) {
  const bodyDuration = input.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const args = ["-y", "-hide_banner", "-loglevel", "warning"];
  // Loop defensively so a provider clip that is a few frames short still fills its
  // storyboard slot. The following trim keeps normally sized clips unchanged.
  files.videos.forEach((video) => args.push("-stream_loop", "-1", "-i", video));
  const narrationIndex = files.videos.length;
  const bgmIndex = narrationIndex + 1;
  const seIndex = narrationIndex + 2;
  args.push("-i", files.narration);
  args.push("-stream_loop", "-1", "-i", files.bgm);
  args.push("-f", "lavfi", "-t", String(bodyDuration), "-i", buildSoundEffectSource(input));

  const videoFilters = input.scenes.map((scene, index) => {
    const incoming = index > 0 ? transitionFadeSeconds(input.scenes[index - 1].transition) : 0;
    const outgoing = index < input.scenes.length - 1 ? transitionFadeSeconds(scene.transition) : 0;
    const fades = [
      incoming > 0 ? `fade=t=in:st=0:d=${incoming}` : "",
      outgoing > 0
        ? `fade=t=out:st=${Math.max(0, scene.duration - outgoing).toFixed(3)}:d=${outgoing}`
        : "",
    ].filter(Boolean);
    return `[${index}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=${input.fps},format=yuv420p10le,trim=duration=${scene.duration},setpts=PTS-STARTPTS${fades.length ? `,${fades.join(",")}` : ""}[v${index}]`;
  });
  const concat = `${input.scenes.map((_, index) => `[v${index}]`).join("")}concat=n=${input.scenes.length}:v=1:a=0[base]`;
  const subtitle = `[base]subtitles=filename='${escapeFilterPath(files.subtitles)}':fontsdir='${escapeFilterPath(fontDirectory)}'[vout]`;
  const audio = [
    `[${narrationIndex}:a]atrim=0:${bodyDuration},asetpts=PTS-STARTPTS,apad,loudnorm=I=-16:TP=-1.5:LRA=11,aformat=sample_fmts=fltp:sample_rates=32000:channel_layouts=stereo,asplit=2[narrmix][side]`,
    `[${bgmIndex}:a]atrim=0:${bodyDuration},asetpts=PTS-STARTPTS,highpass=f=35,lowpass=f=12000,loudnorm=I=-23:TP=-2:LRA=11,afade=t=out:st=${Math.max(0, bodyDuration - 1.5).toFixed(3)}:d=1.5,aformat=sample_fmts=fltp:sample_rates=32000:channel_layouts=stereo[bgm]`,
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
    "libx265",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p10le",
    "-tag:v",
    "hvc1",
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
) {
  const executable = resolveFfmpegPath();
  const bodyOutput = path.join(path.dirname(files.output), "body-master-compatible.mp4");
  const openingTransport = path.join(path.dirname(files.output), "fixed-opening.ts");
  const bodyTransport = path.join(path.dirname(files.output), "body-master-compatible.ts");
  const combinedTransport = path.join(path.dirname(files.output), "fixed-opening-and-body.ts");
  const concatList = path.join(path.dirname(files.output), "fixed-opening-audio-concat.txt");
  const rawCombinedMedia = path.join(path.dirname(files.output), "fixed-opening-and-body-raw.mp4");
  const combinedMedia = path.join(path.dirname(files.output), "fixed-opening-and-body.mp4");
  try {
    await run(executable, buildFfmpegArgs(input, files, fontDirectory, bodyOutput), 270_000);
    await run(executable, buildTransportStreamArgs(files.opening, openingTransport), 60_000);
    await run(executable, buildTransportStreamArgs(bodyOutput, bodyTransport), 60_000);
    await copyFile(openingTransport, combinedTransport);
    await pipeline(
      createReadStream(bodyTransport),
      createWriteStream(combinedTransport, { flags: "a" }),
    );
    await writeFile(
      concatList,
      [files.opening, bodyOutput]
        .map((file) => `file '${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
        .join("\n"),
      "utf8",
    );
    await run(executable, buildCompatibilityConcatArgs(concatList, rawCombinedMedia), 60_000);
    await run(executable, buildPrimingTrimArgs(rawCombinedMedia, combinedMedia), 60_000);
    await run(
      executable,
      buildFixedOpeningConcatArgs(files, combinedTransport, combinedMedia),
      60_000,
    );
  } finally {
    await Promise.all([
      rm(bodyOutput, { force: true }),
      rm(openingTransport, { force: true }),
      rm(bodyTransport, { force: true }),
      rm(combinedTransport, { force: true }),
      rm(concatList, { force: true }),
      rm(rawCombinedMedia, { force: true }),
      rm(combinedMedia, { force: true }),
    ]);
  }
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
