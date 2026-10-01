import "server-only";
import { spawn } from "node:child_process";
import path from "node:path";

export type AudioAnalysis = {
  durationSeconds: number;
  integratedLufs: number;
  truePeakDbtp: number;
  silence: Array<{ start: number; end: number; duration: number }>;
};

export async function analyzeNarrationAudio(file: string): Promise<AudioAnalysis> {
  const output = await runFfmpeg([
    "-hide_banner", "-i", file,
    "-af", "silencedetect=noise=-45dB:d=0.3,loudnorm=I=-17:TP=-2:LRA=11:print_format=json",
    "-f", "null", "-",
  ]);
  const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const loudness = [...output.matchAll(/\{[\s\S]*?"input_i"\s*:\s*"([^\"]+)"[\s\S]*?"input_tp"\s*:\s*"([^\"]+)"[\s\S]*?\}/g)].at(-1);
  if (!durationMatch || !loudness) throw new Error("AUDIO_ANALYSIS_INCOMPLETE");
  const starts = [...output.matchAll(/silence_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  const ends = [...output.matchAll(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g)];
  return {
    durationSeconds: Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]),
    integratedLufs: Number(loudness[1]),
    truePeakDbtp: Number(loudness[2]),
    silence: ends.map((match, index) => ({ start: starts[index] ?? Math.max(0, Number(match[1]) - Number(match[2])), end: Number(match[1]), duration: Number(match[2]) })),
  };
}

function ffmpegPath() {
  return process.env.FFMPEG_PATH || path.join(process.cwd(), ".vercel-build-assets", "ffmpeg");
}

function runFfmpeg(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    const timeout = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(output);
      else reject(new Error(`FFMPEG_ANALYSIS_FAILED:${output.slice(-1200)}`));
    });
  });
}
