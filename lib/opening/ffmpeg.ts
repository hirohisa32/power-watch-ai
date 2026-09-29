import { spawn } from "node:child_process";
import path from "node:path";

export type OpeningRenderFiles = {
  videos: [string, string, string, string];
  narration: string;
  output: string;
};

export const OPENING_AUDIO_MIX = {
  narrationTargetLufs: -14,
  bgmVolume: 0.075,
  seVolume: 0.18,
  finalTargetLufs: -13,
  aacBitrate: "192k",
  channels: 2,
} as const;

export function buildOpeningFfmpegArgs(files: OpeningRenderFiles, fontDirectory: string) {
  const args = ["-y", "-hide_banner", "-loglevel", "warning"];
  files.videos.forEach((video) => args.push("-stream_loop", "-1", "-i", video));
  args.push("-i", files.narration);
  args.push(
    "-f",
    "lavfi",
    "-t",
    "20",
    "-i",
    "aevalsrc='(0.018*sin(2*PI*55*t)+0.01*sin(2*PI*82.41*t)+0.005*sin(2*PI*110*t))*(0.82+0.18*sin(2*PI*0.04*t))':s=44100:c=stereo",
  );
  args.push(
    "-f",
    "lavfi",
    "-t",
    "20",
    "-i",
    "aevalsrc='0.10*sin(2*PI*52*t)*exp(-4*t)*between(t,0,1.1)+0.032*(2*random(0)-1)*between(t,10.2,13.4)+0.08*sin(2*PI*1200*t)*exp(-35*(t-19.1))*between(t,19.1,19.35)':s=44100:c=stereo",
  );
  const video = files.videos.map(
    (_, index) =>
      `[${index}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,trim=duration=5,setpts=PTS-STARTPTS[v${index}]`,
  );
  const font = path.join(fontDirectory, "NotoSansJP.ttf");
  const filter = [
    ...video,
    "[v0][v1][v2][v3]concat=n=4:v=1:a=0[base]",
    `[base]drawtext=fontfile='${escapePath(font)}':text='POWER WATCH':fontcolor=0xD8C39A:fontsize=64:x=(w-text_w)/2:y=h*0.54:enable='between(t,11.1,13.8)':shadowcolor=black@0.55:shadowx=2:shadowy=3,fade=t=out:st=19.55:d=0.45[vout]`,
    "[4:a]adelay=4200|4200,apad,atrim=0:20,loudnorm=I=-14:TP=-1.5:LRA=8,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,asplit=2[narr][side]",
    "[5:a]highpass=f=35,lowpass=f=6000,volume=0.075,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[bgm]",
    "[bgm][side]sidechaincompress=threshold=0.012:ratio=10:attack=18:release=500[ducked]",
    "[6:a]highpass=f=35,lowpass=f=7500,volume=0.18[se]",
    "[narr][ducked][se]amix=inputs=3:duration=longest:normalize=0,alimiter=limit=0.93,loudnorm=I=-13:TP=-1:LRA=9[aout]",
  ].join(";");
  args.push("-filter_complex", filter, "-map", "[vout]", "-map", "[aout]");
  args.push(
    "-t",
    "20",
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "21",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    files.output,
  );
  return args;
}

export async function renderOpeningPreview(files: OpeningRenderFiles, fontDirectory: string) {
  await run(resolveFfmpegPath(), buildOpeningFfmpegArgs(files, fontDirectory), 270_000);
}

export async function inspectOpeningAudio(file: string) {
  const output = await run(
    resolveFfmpegPath(),
    ["-hide_banner", "-i", file, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"],
    45_000,
    true,
  );
  const mean = output.match(/mean_volume:\s*(-?[\d.]+) dB/);
  const max = output.match(/max_volume:\s*(-?[\d.]+) dB/);
  return {
    audioStreamPresent: /Audio:\s*aac/i.test(output),
    meanVolumeDb: mean ? Number(mean[1]) : null,
    maxVolumeDb: max ? Number(max[1]) : null,
    codec: "aac",
    bitrate: OPENING_AUDIO_MIX.aacBitrate,
    channels: OPENING_AUDIO_MIX.channels,
  };
}

function resolveFfmpegPath() {
  return process.env.FFMPEG_PATH || path.join(process.cwd(), ".vercel-build-assets", "ffmpeg");
}

function escapePath(value: string) {
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
      else reject(new Error(`FFMPEG_FAILED:${output.slice(-1600)}`));
    });
  });
}
