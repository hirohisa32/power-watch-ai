import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { OPENING_MASTER_METADATA, WATCH_REVEAL_TEMPLATE } from "./template";

export type OpeningRenderFiles = {
  masterVideo: string;
  watchCutout: string;
  audioMaster: string;
  output: string;
};

export const OPENING_AUDIO_MIX = {
  finalTargetLufs: -13,
  aacBitrate: "192k",
  channels: 2,
} as const;

export function buildOpeningFfmpegArgs(files: OpeningRenderFiles) {
  const duration = OPENING_MASTER_METADATA.totalDurationSeconds;
  const start = WATCH_REVEAL_TEMPLATE.transform.startSeconds;
  const end = WATCH_REVEAL_TEMPLATE.transform.endSeconds;
  const revealDuration = end - start;
  const lift = WATCH_REVEAL_TEMPLATE.transform.liftPixels;
  const black = OPENING_MASTER_METADATA.blackoutStartSeconds;
  const fadeDuration = OPENING_MASTER_METADATA.blackoutEndSeconds - black;
  const progress = `min(max((t-${start})/${end - start},0),1)`;
  const y = `(H-h)/2-${lift}*sin(PI*${progress})`;
  const x = `(W-w)/2+12*sin(2*PI*${progress})`;
  const filter = [
    "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=24,drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='gte(t,12.25)'[master]",
    `[1:v]format=rgba,pad=iw*6:ih*6:(ow-iw)/2:(oh-ih)/2:color=black@0,zoompan=z='1+5*min(on/${Math.max(Math.round(revealDuration * 24), 1)},1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1320x1600:fps=24,format=rgba,rotate='-0.10+0.10*min(n/${Math.max(Math.round(revealDuration * 24), 1)},1)':ow=rotw(iw):oh=roth(ih):c=none,setpts=PTS-STARTPTS+${start}/TB,split=2[watch][shadowbase]`,
    `[shadowbase]colorchannelmixer=rr=0:gg=0:bb=0:aa=${WATCH_REVEAL_TEMPLATE.transform.shadowOpacity},boxblur=18:2[shadow]`,
    `[master][shadow]overlay=x='${x}+18':y='${y}+28':enable='between(t,${start},${end})'[withshadow]`,
    `[withshadow][watch]overlay=x='${x}':y='${y}':enable='between(t,${start},${end})',fade=t=out:st=${black}:d=${fadeDuration}:color=black[vout]`,
    `[2:a]atrim=0:${duration},asetpts=PTS-STARTPTS,afade=t=out:st=${black}:d=${Math.min(0.16, fadeDuration)},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aout]`,
  ].join(";");
  return [
    "-y", "-hide_banner", "-loglevel", "warning",
    "-i", files.masterVideo,
    "-loop", "1", "-framerate", "24", "-i", files.watchCutout,
    "-i", files.audioMaster,
    "-filter_complex", filter,
    "-map", "[vout]", "-map", "[aout]",
    "-t", String(duration), "-r", "24",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", OPENING_AUDIO_MIX.aacBitrate, "-ac", "2",
    "-movflags", "+faststart", files.output,
  ];
}

export async function renderOpeningPreview(files: OpeningRenderFiles) {
  await run(resolveFfmpegPath(), buildOpeningFfmpegArgs(files), 270_000);
}

export async function inspectOpeningAudio(file: string) {
  const output = await run(resolveFfmpegPath(), ["-hide_banner", "-i", file, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"], 45_000, true);
  const mean = output.match(/mean_volume:\s*(-?[\d.]+) dB/);
  const max = output.match(/max_volume:\s*(-?[\d.]+) dB/);
  return {
    audioStreamPresent: /Audio:\s*aac/i.test(output),
    meanVolumeDb: mean ? Number(mean[1]) : null,
    maxVolumeDb: max ? Number(max[1]) : null,
    codec: "aac",
    bitrate: OPENING_AUDIO_MIX.aacBitrate,
    channels: OPENING_AUDIO_MIX.channels,
    reusePolicy: OPENING_MASTER_METADATA.audioReusePolicy,
  };
}

export function resolveFfmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const bundled = path.join(process.cwd(), ".vercel-build-assets", "ffmpeg");
  if (process.platform !== "win32") return bundled;
  const require = createRequire(import.meta.url);
  return path.join(path.dirname(require.resolve("@ffmpeg-installer/win32-x64/package.json")), "ffmpeg.exe");
}

function run(executable: string, args: string[], timeoutMs: number, allowFailure = false) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    const timeout = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("error", (error) => { clearTimeout(timeout); reject(new Error(`FFMPEG_START_FAILED:${error.message}`)); });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0 || allowFailure) resolve(output);
      else reject(new Error(`FFMPEG_FAILED:${output.slice(-2400)}`));
    });
  });
}
