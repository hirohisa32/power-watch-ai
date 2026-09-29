import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { WATCH_MOTION_SEGMENTS, type WatchAngleRole } from "./motion";
import { OPENING_MASTER_METADATA, WATCH_REVEAL_TEMPLATE } from "./template";

export type WatchCutout = { path: string; role: WatchAngleRole };
export type OpeningRenderFiles = { watchlessMaster: string; watchCutouts: WatchCutout[]; audioMaster: string; output: string };

export const OPENING_AUDIO_MIX = { finalTargetLufs: -13, aacBitrate: "192k", channels: 2 } as const;

function pickCutout(cutouts: WatchCutout[], role: WatchAngleRole) {
  return cutouts.find((item) => item.role === role) ?? cutouts.find((item) => item.role === "front") ?? cutouts[0];
}

function transformChain(input: number, index: number) {
  const segment = WATCH_MOTION_SEGMENTS[index];
  const frames = Math.max(2, Math.round((segment.end - segment.start) * OPENING_MASTER_METADATA.fps));
  const p = `min(max(on/${frames - 1},0),1)`;
  const ease = `(${p}*${p}*(3-2*${p}))`;
  const zoom = `${segment.zoomStart}+(${segment.zoomEnd - segment.zoomStart})*${ease}`;
  const rotation = `${segment.rotationStart}+(${segment.rotationEnd - segment.rotationStart})*min(max(n/${frames - 1},0),1)`;
  const fadeIn = index === 0 ? 0.10 : segment.crossfade;
  const perspectiveInset = Math.round(Math.min(110, Math.max(8, segment.visibleAngleStart * 1.15)));
  return [
    `[${input}:v]format=rgba,perspective=x0=${perspectiveInset}:y0=18:x1=W-${Math.round(perspectiveInset * 0.35)}:y1=0:x2=0:y2=H-12:x3=W:y3=H:interpolation=cubic:sense=destination`,
    "pad=iw*6:ih*6:(ow-iw)/2:(oh-ih)/2:color=black@0",
    `zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1320x1600:fps=24`,
    `format=rgba,rotate='${rotation}':ow=rotw(iw):oh=roth(ih):c=none`,
    "eq=brightness=-0.035:contrast=1.08:saturation=0.84:gamma=0.96",
    "noise=alls=1.7:allf=t+u",
    "tmix=frames=3:weights='1 2 1'",
    `setpts=PTS-STARTPTS+${segment.start}/TB`,
    `fade=t=in:st=${segment.start}:d=${fadeIn}:alpha=1`,
    `fade=t=out:st=${segment.end - segment.crossfade}:d=${segment.crossfade}:alpha=1`,
    `split=2[w${index}][s${index}]`,
  ].join(",");
}

export function buildOpeningFfmpegArgs(files: OpeningRenderFiles) {
  if (!files.watchCutouts.length) throw new Error("OPENING_WATCH_CUTOUTS_REQUIRED");
  const duration = OPENING_MASTER_METADATA.totalDurationSeconds;
  const black = OPENING_MASTER_METADATA.blackoutStartSeconds;
  const fadeDuration = OPENING_MASTER_METADATA.blackoutEndSeconds - black;
  const ordered = WATCH_MOTION_SEGMENTS.map((segment) => pickCutout(files.watchCutouts, segment.role));
  const filters = [
    "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=24[base]",
    ...WATCH_MOTION_SEGMENTS.map((_, index) => transformChain(index + 1, index)),
  ];
  let previous = "base";
  WATCH_MOTION_SEGMENTS.forEach((segment, index) => {
    const progress = `min(max((t-${segment.start})/${segment.end - segment.start},0),1)`;
    const x = `W*(${segment.centerXStart}+(${segment.centerXEnd - segment.centerXStart})*${progress})-w/2`;
    const y = `H*(${segment.centerYStart}+(${segment.centerYEnd - segment.centerYStart})*${progress})-h/2`;
    filters.push(`[s${index}]colorchannelmixer=rr=0:gg=0:bb=0:aa=${WATCH_REVEAL_TEMPLATE.transform.shadowOpacity},boxblur=22:2[sh${index}]`);
    filters.push(`[${previous}][sh${index}]overlay=x='${x}+18':y='${y}+32':enable='between(t,${segment.start},${segment.end})'[shadowed${index}]`);
    filters.push(`[shadowed${index}][w${index}]overlay=x='${x}':y='${y}':enable='between(t,${segment.start},${segment.end})'[watch${index}]`);
    previous = `watch${index}`;
  });
  filters.push("[0:v]crop=1080:610:0:970,format=rgba,fade=t=in:st=9.22:d=0.08:alpha=1,fade=t=out:st=10.86:d=0.28:alpha=1,setpts=PTS-STARTPTS[foreground]");
  filters.push(`[${previous}][foreground]overlay=0:970:enable='between(t,9.22,11.14)',fade=t=out:st=${black}:d=${fadeDuration}:color=black[vout]`);
  filters.push(`[${ordered.length + 1}:a]atrim=0:${duration},asetpts=PTS-STARTPTS,afade=t=out:st=14.72:d=${Math.max(0.12, duration - 14.72)},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aout]`);

  const args = ["-y", "-hide_banner", "-loglevel", "warning", "-i", files.watchlessMaster];
  for (const cutout of ordered) args.push("-loop", "1", "-framerate", "24", "-i", cutout.path);
  args.push("-i", files.audioMaster, "-filter_complex", filters.join(";"), "-map", "[vout]", "-map", "[aout]", "-t", String(duration), "-r", "24", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", OPENING_AUDIO_MIX.aacBitrate, "-ac", "2", "-movflags", "+faststart", files.output);
  return args;
}

export async function renderOpeningPreview(files: OpeningRenderFiles) { await run(resolveFfmpegPath(), buildOpeningFfmpegArgs(files), 720_000); }

export async function inspectOpeningAudio(file: string) {
  const output = await run(resolveFfmpegPath(), ["-hide_banner", "-i", file, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"], 45_000, true);
  const mean = output.match(/mean_volume:\s*(-?[\d.]+) dB/);
  const max = output.match(/max_volume:\s*(-?[\d.]+) dB/);
  return { audioStreamPresent: /Audio:\s*aac/i.test(output), meanVolumeDb: mean ? Number(mean[1]) : null, maxVolumeDb: max ? Number(max[1]) : null, codec: "aac", bitrate: OPENING_AUDIO_MIX.aacBitrate, channels: OPENING_AUDIO_MIX.channels, reusePolicy: OPENING_MASTER_METADATA.audioReusePolicy };
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
    child.once("close", (code) => { clearTimeout(timeout); if (code === 0 || allowFailure) resolve(output); else reject(new Error(`FFMPEG_FAILED:${output.slice(-4000)}`)); });
  });
}
