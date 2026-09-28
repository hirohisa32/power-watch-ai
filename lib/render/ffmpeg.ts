import { spawn } from "node:child_process";
import path from "node:path";
import type { FinalRenderInput } from "./types";
import { SOUND_EFFECT_BY_PRESET } from "./plan";

export type FfmpegRenderFiles = {
  videos: string[];
  narration: string;
  subtitles: string;
  output: string;
};

export function buildFfmpegArgs(
  input: FinalRenderInput,
  files: FfmpegRenderFiles,
  fontDirectory: string,
) {
  const args = ["-y", "-hide_banner", "-loglevel", "warning"];
  files.videos.forEach((video) => args.push("-i", video));
  const narrationIndex = files.videos.length;
  const bgmIndex = narrationIndex + 1;
  const seIndex = narrationIndex + 2;
  args.push("-i", files.narration);
  args.push(
    "-f",
    "lavfi",
    "-t",
    String(input.totalDuration),
    "-i",
    "sine=frequency=98:sample_rate=44100",
  );
  args.push("-f", "lavfi", "-t", String(input.totalDuration), "-i", buildSoundEffectSource(input));

  const videoFilters = input.scenes.map(
    (scene, index) =>
      `[${index}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,trim=duration=${scene.duration},setpts=PTS-STARTPTS[v${index}]`,
  );
  const concat = `${input.scenes.map((_, index) => `[v${index}]`).join("")}concat=n=${input.scenes.length}:v=1:a=0[base]`;
  const subtitle = `[base]subtitles=filename='${escapeFilterPath(files.subtitles)}':fontsdir='${escapeFilterPath(fontDirectory)}'[vout]`;
  const audio = [
    `[${narrationIndex}:a]atrim=0:${input.totalDuration},asetpts=PTS-STARTPTS,apad,loudnorm=I=-16:TP=-1.5:LRA=11,asplit=2[narrmix][side]`,
    `[${bgmIndex}:a]volume=0.11[bgm]`,
    `[bgm][side]sidechaincompress=threshold=0.018:ratio=10:attack=20:release=450[ducked]`,
    `[${seIndex}:a]volume=0.24[se]`,
    `[narrmix][ducked][se]amix=inputs=3:duration=longest:normalize=0,alimiter=limit=0.92,loudnorm=I=-14:TP=-1.0:LRA=10[aout]`,
  ];
  args.push("-filter_complex", [...videoFilters, concat, subtitle, ...audio].join(";"));
  args.push(
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-t",
    String(input.totalDuration),
    "-r",
    String(input.fps),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    files.output,
  );
  return args;
}

export async function renderWithFfmpeg(
  input: FinalRenderInput,
  files: FfmpegRenderFiles,
  fontDirectory = resolveFontDirectory(),
) {
  const executable = resolveFfmpegPath();
  await run(executable, buildFfmpegArgs(input, files, fontDirectory), 270_000);
}

export async function probeDurationMs(file: string) {
  const executable = resolveFfmpegPath();
  const output = await run(executable, ["-hide_banner", "-i", file], 30_000, true);
  const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Math.round((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000);
}

export async function concatSpeechAudio(files: string[], output: string) {
  if (!files.length) throw new Error("AUDIO_SEGMENTS_REQUIRED");
  if (files.length === 1) {
    const { copyFile } = await import("node:fs/promises");
    await copyFile(files[0], output);
    return;
  }
  const args = ["-y", "-hide_banner", "-loglevel", "warning"];
  files.forEach((file) => args.push("-i", file));
  const inputs = files.map((_, index) => `[${index}:a]`).join("");
  args.push(
    "-filter_complex",
    `${inputs}concat=n=${files.length}:v=0:a=1,aresample=44100[aout]`,
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
  const terms = input.scenes.map((scene) => {
    const frequency = SOUND_EFFECT_BY_PRESET[scene.preset]?.frequency ?? 440;
    const start = cursor;
    const end = Math.min(cursor + 0.32, cursor + scene.duration);
    cursor += scene.duration;
    return `0.16*sin(2*PI*${frequency}*t)*between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})`;
  });
  return `aevalsrc='${terms.join("+")}':s=44100:c=stereo`;
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
