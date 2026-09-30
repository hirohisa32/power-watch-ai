import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function normalizeVoicePreviewAudio(bytes: Uint8Array) {
  const directory = await mkdtemp(path.join(tmpdir(), "voice-preview-"));
  const input = path.join(directory, "raw.mp3");
  const output = path.join(directory, "normalized.mp3");
  try {
    await writeFile(input, bytes);
    await runFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      input,
      "-af",
      "loudnorm=I=-17:TP=-2:LRA=9",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      output,
    ]);
    return new Uint8Array(await readFile(output));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function runFfmpeg(args: string[]) {
  const executable =
    process.env.FFMPEG_PATH ?? path.join(process.cwd(), ".vercel-build-assets", "ffmpeg");
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    let output = "";
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    const timeout = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`VOICE_NORMALIZATION_START_FAILED:${error.message}`));
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`VOICE_NORMALIZATION_FAILED:${output.slice(-800)}`));
    });
  });
}
