import { spawn } from "node:child_process";
import path from "node:path";

export const PRODUCT_EVIDENCE_PROVIDER = "internal-product-evidence";
export const PRODUCT_EVIDENCE_MODEL = "original-product-photo-motion-v1";

export function buildProductPhotoMotionArgs(input: string, output: string, duration: number, preset = "medium") {
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "warning",
    "-loop",
    "1",
    "-i",
    input,
    "-t",
    String(duration),
    "-vf",
    [
      "scale=1120:1992:force_original_aspect_ratio=increase",
      "crop=1080:1920",
      "zoompan=z='min(zoom+0.00012,1.009)':x='iw/2-iw/zoom/2+3*sin(on/24)':y='ih/2-ih/zoom/2+2*cos(on/31)':d=1:s=1080x1920:fps=30",
      "hqdn3d=0.55:0.4:1.0:0.8",
      "unsharp=5:5:0.22:5:5:0",
      "eq=contrast=1.018:saturation=1.008:brightness='0.002*sin(2*PI*t/6)'",
      "vignette=PI/7",
      "noise=alls=0.35:allf=t+u",
      "format=yuv420p",
    ].join(","),
    "-an",
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
      preset,
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    output,
  ];
}

export async function renderProductPhotoMotion(input: string, output: string, duration: number, preset = "medium") {
  const executable = process.env.FFMPEG_PATH || path.join(process.cwd(), ".vercel-build-assets", "ffmpeg");
  const args = buildProductPhotoMotionArgs(input, output, duration, preset);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    let errorOutput = "";
    child.stderr.on("data", (chunk) => (errorOutput += chunk.toString()));
    const timeout = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`PRODUCT_PHOTO_FFMPEG_START_FAILED:${error.message}`));
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`PRODUCT_PHOTO_FFMPEG_FAILED:${errorOutput.slice(-1000)}`));
    });
  });
}
