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
  // Loop defensively so a provider clip that is a few frames short still fills its
  // storyboard slot. The following trim keeps normally sized clips unchanged.
  files.videos.forEach((video) => args.push("-stream_loop", "-1", "-i", video));
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
    "aevalsrc='0.028*sin(2*PI*55*t)+0.016*sin(2*PI*82.41*t)+0.009*sin(2*PI*110*t)':s=44100:c=stereo",
  );
  args.push("-f", "lavfi", "-t", String(input.totalDuration), "-i", buildSoundEffectSource(input));

  const videoFilters = input.scenes.map((scene, index) => {
    const fade = transitionFadeSeconds(scene.transition);
    const fades = [
      index > 0 && fade > 0 ? `fade=t=in:st=0:d=${fade}` : "",
      index < input.scenes.length - 1 && fade > 0
        ? `fade=t=out:st=${Math.max(0, scene.duration - fade).toFixed(3)}:d=${fade}`
        : "",
    ].filter(Boolean);
    return `[${index}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,trim=duration=${scene.duration},setpts=PTS-STARTPTS${fades.length ? `,${fades.join(",")}` : ""}[v${index}]`;
  });
  const concat = `${input.scenes.map((_, index) => `[v${index}]`).join("")}concat=n=${input.scenes.length}:v=1:a=0[base]`;
  const subtitle = `[base]subtitles=filename='${escapeFilterPath(files.subtitles)}':fontsdir='${escapeFilterPath(fontDirectory)}'[vout]`;
  const audio = [
    `[${narrationIndex}:a]atrim=0:${input.totalDuration},asetpts=PTS-STARTPTS,apad,loudnorm=I=-16:TP=-1.5:LRA=11,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,asplit=2[narrmix][side]`,
    `[${bgmIndex}:a]highpass=f=45,lowpass=f=900,volume=0.08,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[bgm]`,
    `[bgm][side]sidechaincompress=threshold=0.018:ratio=10:attack=20:release=450[ducked]`,
    `[${seIndex}:a]highpass=f=55,lowpass=f=4000,volume=0.14[se]`,
    `[narrmix][ducked][se]amix=inputs=3:duration=longest,alimiter=limit=0.92,loudnorm=I=-14:TP=-1.0:LRA=10[aout]`,
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
    const end = Math.min(start + (scene.preset === "Racing" ? 1.25 : 0.45), cursor);
    const elapsed = `(t-${start.toFixed(3)})`;
    if (scene.preset === "Racing")
      return [
        `0.11*sin(2*PI*(${effect.frequency}+28*${elapsed})*t)*between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})`,
      ];
    return [
      `0.13*sin(2*PI*${effect.frequency}*t)*exp(-7*${elapsed})*between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})`,
    ];
  });
  return `aevalsrc='${terms.join("+") || "0"}':s=44100:c=stereo`;
}

export function transitionFadeSeconds(transition?: string) {
  const value = transition?.toLocaleLowerCase() ?? "";
  if (/hard cut|motion match|cut on|straight cut|documentary cut/.test(value)) return 0;
  if (/dissolve|fade|bloom|optical|dust|page/.test(value)) return 0.22;
  return 0.12;
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
