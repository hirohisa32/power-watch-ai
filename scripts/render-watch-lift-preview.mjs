import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "artifacts", "gold-khanjar-quality-preview", "sns-keyframes-v2");
const input = path.join(outputDir, "watch-lift-identity-locked-keyframe.png");
const output = path.join(outputDir, "watch-lift-identity-locked-preview.mp4");
const contactSheet = path.join(outputDir, "watch-lift-preview-contact-sheet.jpg");
const qaPath = path.join(outputDir, "watch-lift-preview-quality-gate.json");
const ffmpeg = path.join(root, "node_modules", "@ffmpeg-installer", "win32-x64", "ffmpeg.exe");

const frames = 54;
const fps = 30;
const duration = frames / fps;
const filter = [
  "zoompan=z='1+0.00015*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)-1.5*on/54':d=54:s=1080x1920:fps=30",
  "eq=brightness='0.0025*sin(2*PI*t/1.8)'",
  "noise=alls=0.7:allf=t+u",
  "format=yuv420p",
].join(",");

run([
  "-y", "-loop", "1", "-i", input,
  "-vf", filter,
  "-frames:v", String(frames), "-r", String(fps),
  "-c:v", "libx264", "-preset", "slow", "-crf", "16",
  "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p",
  "-movflags", "+faststart", "-an", output,
]);

run([
  "-y", "-i", output,
  "-vf", "select='eq(n,0)+eq(n,13)+eq(n,27)+eq(n,40)+eq(n,53)',scale=270:480,tile=5x1",
  "-frames:v", "1", "-q:v", "2", contactSheet,
]);

const sourceSha256 = createHash("sha256").update(await readFile(input)).digest("hex");
const { width, height } = await sharp(input).metadata();
const qa = {
  sourceKeyframe: path.relative(root, input).replaceAll("\\", "/"),
  sourceSha256,
  output: path.relative(root, output).replaceAll("\\", "/"),
  durationSeconds: duration,
  fps,
  resolution: `${width}x${height}`,
  animation: {
    sourceFrames: 1,
    geometryRegeneration: false,
    morph: false,
    redraw: false,
    layerMotion: false,
    cameraDolly: "1.0000x to 1.00795x",
    verticalCameraDriftPx: -1.5,
    brightnessAmplitude: 0.0025,
    grainStrength: 0.7,
  },
  qualityGate: {
    identityGeometry: "pass-by-construction-single-source-keyframe",
    gripContinuity: "pass-candidate-no-relative-layer-motion",
    fingerOcclusionContinuity: "pass-candidate-no-relative-layer-motion",
    contactShadowContinuity: "pass-candidate-baked-into-source-keyframe",
    humanReview: "required",
  },
};
await writeFile(qaPath, `${JSON.stringify(qa, null, 2)}\n`);
console.log(JSON.stringify({ output, contactSheet, qaPath, qa }, null, 2));

function run(args) {
  const result = spawnSync(ffmpeg, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "FFmpeg failed");
}
