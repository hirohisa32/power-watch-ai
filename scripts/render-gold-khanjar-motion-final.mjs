import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const ffmpeg = path.join(root, "node_modules", "@ffmpeg-installer", "win32-x64", "ffmpeg.exe");
const source = (...parts) => path.join(root, ...parts);
const work = source("artifacts", "gold-khanjar-motion-final");
const clipsDir = path.join(work, "clips");
const layersDir = path.join(work, "motion-layers");
const historical = source("artifacts", "gold-khanjar-client-final", "historical-reused");
const masters = source("artifacts", "gold-khanjar-quality-preview", "stylized-masters-v2");
const sns = source("artifacts", "gold-khanjar-quality-preview", "sns-keyframes-v2");
await mkdir(clipsDir, { recursive: true });
await mkdir(layersDir, { recursive: true });

const lightSweep = path.join(layersDir, "light-sweep.png");
const particles = path.join(layersDir, "particles.png");
await makeAtmosphereAssets();

const masterFiles = [
  "01-full-watch.png", "02-dial-macro.png", "03-outer-caseback.png",
  "04-inner-caseback-serial.png", "05-movement.png", "06-side-crown.png",
  "07-bracelet-clasp.png",
];
for (const file of masterFiles) await makeIdentityLockedLayer(path.join(masters, file), path.join(layersDir, file));

const clips = [];
async function videoClip(name, input, duration, { start = 0, filter = "", grade = false } = {}) {
  const output = path.join(clipsDir, `${String(clips.length).padStart(2, "0")}-${name}.mp4`);
  const vf = [
    "scale=1080:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920",
    filter,
    grade ? "eq=contrast=1.04:saturation=0.86:brightness=-0.008" : "",
    grade ? "curves=all='0/0 0.25/0.21 0.72/0.76 1/1'" : "",
    grade ? "noise=alls=0.65:allf=t+u" : "",
    "fps=30",
    "format=yuv420p",
  ].filter(Boolean).join(",");
  run(["-y", "-ss", String(start), "-i", input, "-t", String(duration), "-an", "-vf", vf,
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-level", "4.1",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
  clips.push({ name, duration, output, source: path.relative(root, input).replaceAll("\\", "/") });
}

async function historicalClip(name, input, duration, start) {
  await videoClip(name, input, duration, { start, grade: true,
    filter: "scale=1120:1992,crop=1080:1920:x='20+7*sin(n/36)':y='36+5*cos(n/42)'" });
}

async function productMotionClip(name, file, duration, options = {}) {
  const original = path.join(masters, file);
  const locked = path.join(layersDir, file);
  const output = path.join(clipsDir, `${String(clips.length).padStart(2, "0")}-${name}.mp4`);
  const size = options.size ?? 1480;
  const xAmplitude = options.xAmplitude ?? 10;
  const yAmplitude = options.yAmplitude ?? 7;
  const direction = options.direction ?? 1;
  const sweepSpeed = 1580 / duration;
  const filter = [
    `[0:v]scale=1940:1940,crop=1080:1920:x='430+18*sin(n/41)':y='10*cos(n/53)',boxblur=28:2,eq=brightness=-0.10:saturation=0.76[bg]`,
    `[1:v]scale=${size}:${size}:force_original_aspect_ratio=decrease,format=rgba[watch]`,
    `[2:v]format=rgba,colorchannelmixer=aa=0.38[sweep]`,
    `[3:v]format=rgba,colorchannelmixer=aa=0.48[dust]`,
    `[bg][watch]overlay=x='(W-w)/2+${direction * xAmplitude}*sin(t*0.85)':y='(H-h)/2+${yAmplitude}*cos(t*0.72)':eval=frame[depth]`,
    `[depth][sweep]overlay=x='-520+${sweepSpeed.toFixed(4)}*t':y=-80:eval=frame[lit]`,
    `[lit][dust]overlay=x='7*sin(t*0.7)':y='-18+10*sin(t*0.55)':eval=frame,eq=contrast=1.025:saturation=0.93:brightness='0.0035*sin(2*PI*t/${duration})',vignette=PI/5,noise=alls=0.48:allf=t+u,fps=30,format=yuv420p`,
  ].join(";");
  run(["-y", "-loop", "1", "-i", original, "-loop", "1", "-i", locked, "-loop", "1", "-i", lightSweep,
    "-loop", "1", "-i", particles, "-filter_complex", filter, "-t", String(duration), "-an",
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high", "-level", "4.1",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
  clips.push({ name, duration, output, source: `identity-locked:${file}`, motion: ["depth-parallax", "camera-drift", "light-sweep", "atmospheric-particles", "focus-separation"] });
}

async function watchLiftClip(name, duration, variant) {
  const layerA = path.join(sns, "layer-a-background.png");
  const layerB = path.join(sns, "layer-b-watch-master-locked.png");
  const layerC = path.join(sns, "layer-c-glove-occlusion.png");
  const output = path.join(clipsDir, `${String(clips.length).padStart(2, "0")}-${name}.mp4`);
  const close = variant === "lift";
  const baseScale = close ? 1.025 : 1.008;
  const drift = close ? 5 : 3;
  const sweepSpeed = 1500 / duration;
  const filter = [
    `[0:v]scale=${Math.round(1080 * baseScale)}:${Math.round(1920 * baseScale)},crop=1080:1920:x='(iw-ow)/2+${drift}*sin(n/24)':y='(ih-oh)/2+${drift}*cos(n/27)'[bg]`,
    `[1:v]format=rgba[watch]`,
    `[2:v]format=rgba[gloves]`,
    `[3:v]format=rgba,colorchannelmixer=aa=0.30[sweep]`,
    `[4:v]format=rgba,colorchannelmixer=aa=0.40[dust]`,
    `[bg][watch]overlay=0:0[locked]`,
    `[locked][gloves]overlay=0:0[grip]`,
    `[grip][sweep]overlay=x='-520+${sweepSpeed.toFixed(4)}*t':y=-80:eval=frame[lit]`,
    `[lit][dust]overlay=x='5*sin(t*0.72)':y='-12+7*sin(t*0.54)':eval=frame,zoompan=z='min(zoom+0.00012,1.0065)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=30,eq=brightness='0.0028*sin(2*PI*t/${duration})',noise=alls=0.45:allf=t+u,format=yuv420p`,
  ].join(";");
  run(["-y", "-loop", "1", "-i", layerA, "-loop", "1", "-i", layerB, "-loop", "1", "-i", layerC,
    "-loop", "1", "-i", lightSweep, "-loop", "1", "-i", particles, "-filter_complex", filter,
    "-t", String(duration), "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "16",
    "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
  clips.push({ name, duration, output, source: "identity-locked-watch-lift-three-layer", motion: ["background-parallax", "camera-dolly", "light-movement", "atmospheric-particles"] });
}

await videoClip("fixed-opening", source("assets", "opening", "opening-master.mp4"), 15.07);
await videoClip("story-entry", source("artifacts", "gold-khanjar-quality-preview", "story-entry", "story-entry-only.mp4"), 2.5, { filter: "setpts=0.4166667*PTS" });
await historicalClip("oman", path.join(historical, "scene-06-oman.mp4"), 3, 0.25);
await historicalClip("qaboos-era", path.join(historical, "scene-07-qaboos.mp4"), 3, 0.45);
await historicalClip("diplomacy", path.join(historical, "scene-08-diplomacy.mp4"), 3, 0.35);
await historicalClip("asprey", path.join(historical, "scene-10-asprey.mp4"), 3, 0.15);
await historicalClip("gift-preparation", path.join(historical, "scene-10-asprey.mp4"), 2.4, 2.55);
await historicalClip("gift-delivery", path.join(historical, "scene-09-gift.mp4"), 2.2, 2.45);
await watchLiftClip("watch-reveal", 1.8, "reveal");
await watchLiftClip("watch-lift", 1.8, "lift");
await videoClip("reaction", source("artifacts", "gold-khanjar-quality-preview", "shot-gates-v1", "shot-1-runway-raw.mp4"), 1.8, { start: 0.25, grade: true, filter: "scale=1100:1956,crop=1080:1920:x='10+3*sin(n/28)':y='18+2*cos(n/31)'" });
await productMotionClip("dial-macro", "02-dial-macro.png", 2.6, { size: 1680, xAmplitude: 8, yAmplitude: 5 });
await productMotionClip("khanjar-focus", "02-dial-macro.png", 2.4, { size: 1920, xAmplitude: 6, yAmplitude: 8, direction: -1 });
await productMotionClip("outer-caseback", "03-outer-caseback.png", 2.5, { size: 1580, direction: -1 });
await productMotionClip("serial-5082955", "04-inner-caseback-serial.png", 2.5, { size: 1720, xAmplitude: 7 });
await productMotionClip("movement", "05-movement.png", 2.5, { size: 1680, yAmplitude: 9, direction: -1 });
await productMotionClip("side-crown", "06-side-crown.png", 2, { size: 1580, xAmplitude: 12 });
await productMotionClip("bracelet-clasp", "07-bracelet-clasp.png", 2, { size: 1600, direction: -1 });
await productMotionClip("product-hero", "01-full-watch.png", 3, { size: 1500, xAmplitude: 9, yAmplitude: 5 });

const ending = path.join(clipsDir, `${String(clips.length).padStart(2, "0")}-brand-ending.mp4`);
run(["-y", "-f", "lavfi", "-i", "color=c=#050505:s=1080x1920:r=30:d=2.5", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p", "-movflags", "+faststart", ending]);
clips.push({ name: "brand-ending", duration: 2.5, output: ending, source: "unchanged" });

const concatFile = path.join(work, "concat.txt");
await writeFile(concatFile, clips.map((item) => `file '${item.output.replaceAll("'", "'\\''")}'`).join("\n") + "\n");
const baseVideo = path.join(work, "gold-khanjar-motion-video-base.mp4");
run(["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", baseVideo]);

const subtitles = path.join(work, "gold-khanjar-motion-final.ass");
await writeFile(subtitles, ass());
const subtitledVideo = path.join(work, "gold-khanjar-motion-video.mp4");
run(["-y", "-i", baseVideo, "-vf", "ass=artifacts/gold-khanjar-motion-final/gold-khanjar-motion-final.ass", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p", "-movflags", "+faststart", subtitledVideo]);

const mixedAudio = path.join(work, "gold-khanjar-motion-audio.m4a");
const opening = source("assets", "opening", "opening-master.mp4");
const narration = source("artifacts", "gold-khanjar-client-final", "audio", "narration-approved-eleven-v4.mp3");
const bgm = source("system-assets", "bgm", "The_Journey_Begins_Cinematic_Intro_Opener_Theme.mp3");
const audioFilter = [
  "[0:a]atrim=0:15.07,asetpts=PTS-STARTPTS,aresample=48000[opening]",
  "[1:a]loudnorm=I=-17:TP=-2:LRA=7,aresample=48000,adelay=15200|15200[narration]",
  "[2:a]atrim=0:46.5,asetpts=PTS-STARTPTS,aresample=48000,volume=0.56,afade=t=in:st=0:d=1.1,afade=t=out:st=45:d=1.5,adelay=15070|15070[bgm]",
  "[opening][narration][bgm]amix=inputs=3:duration=longest:dropout_transition=0,alimiter=limit=0.891,loudnorm=I=-15:TP=-1:LRA=9[aout]",
].join(";");
run(["-y", "-i", opening, "-i", narration, "-stream_loop", "-1", "-i", bgm, "-filter_complex", audioFilter, "-map", "[aout]", "-t", "61.57", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", mixedAudio]);

const final = path.join(work, "gold-khanjar-motion-final.mp4");
run(["-y", "-i", subtitledVideo, "-i", mixedAudio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "copy", "-t", "61.57", "-movflags", "+faststart", final]);

let at = 0;
const timeline = clips.map((clip) => { const entry = { ...clip, start: Number(at.toFixed(2)), end: Number((at + clip.duration).toFixed(2)) }; at += clip.duration; return entry; });
const manifest = { final, durationSeconds: at, resolution: "1080x1920", fps: 30, unchanged: ["fixed-opening", "narration", "voice-a", "eleven-v4", "bgm", "se", "subtitle-copy", "viewer-text", "story-order", "watch-identity", "watch-scale", "ending", "audio-mix-policy"], runway: { newCredits: 0, reason: "production-insufficient-credits", reusedCredits: 300 }, clips: timeline };
await writeFile(path.join(work, "final-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ final, durationSeconds: at, clips: clips.length, sha256: createHash("sha256").update(await readFile(final)).digest("hex") }, null, 2));

async function makeIdentityLockedLayer(input, output) {
  const image = sharp(input).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const candidate = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const p = i * 4, r = data[p], g = data[p + 1], b = data[p + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 58 && max - min < 34) candidate[i] = 1;
  }
  const background = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const enqueue = (index) => { if (candidate[index] && !background[index]) { background[index] = 1; queue[tail++] = index; } };
  for (let x = 0; x < width; x += 2) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y += 2) { enqueue(y * width); enqueue(y * width + width - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % width;
    if (x > 0) enqueue(i - 1); if (x + 1 < width) enqueue(i + 1);
    if (i >= width) enqueue(i - width); if (i + width < background.length) enqueue(i + width);
  }
  for (let i = 0; i < width * height; i++) data[i * 4 + 3] = background[i] ? 0 : 255;
  await sharp(data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(output);
}

async function makeAtmosphereAssets() {
  if (!existsSync(lightSweep)) {
    const svg = Buffer.from(`<svg width="520" height="2080" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#fff5d5" stop-opacity="0"/><stop offset="0.5" stop-color="#fff5d5" stop-opacity="0.28"/><stop offset="1" stop-color="#fff5d5" stop-opacity="0"/></linearGradient></defs><path d="M180 -80 L520 -80 L340 2160 L0 2160 Z" fill="url(#g)"/></svg>`);
    await sharp(svg).blur(34).png().toFile(lightSweep);
  }
  if (!existsSync(particles)) {
    let circles = "";
    let seed = 1970;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 72; i++) {
      const x = Math.round(random() * 1080), y = Math.round(random() * 1920), r = (0.7 + random() * 2.2).toFixed(1), opacity = (0.04 + random() * 0.12).toFixed(2);
      circles += `<circle cx="${x}" cy="${y}" r="${r}" fill="#f5d99b" opacity="${opacity}"/>`;
    }
    await sharp(Buffer.from(`<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">${circles}</svg>`)).blur(0.45).png().toFile(particles);
  }
}

function run(args) {
  const result = spawnSync(ffmpeg, args, { encoding: "utf8", maxBuffer: 40 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || `FFmpeg failed: ${args.join(" ")}`);
}

function ass() {
  const events = [
    [17.7,20.4,"1970s / OMAN","新しい時代を迎えたオマーン"], [20.6,23.4,"A NEW ERA","国に尽くした功労者へ"],
    [23.7,26.5,"OMAN × UNITED KINGDOM","特別な時計が贈られた"], [26.8,29.5,"ASPREY / LONDON","英国の名門ジュエラー、アスプレイ"],
    [31.0,34.0,"A SPECIAL GIFT","選ばれたのは、ロレックス"], [39.7,42.0,"GOLD KHANJAR","威信を象徴する金色のカンジャル"],
    [42.2,44.5,"THE EMBLEM","これは、ただの装飾ではない"], [44.7,47.0,"ASPREY","英国との結びつきを刻む証"],
    [47.2,49.5,"SERIAL 5082955 / 1665","500万番台のシリアル、そして1665/0"], [49.7,52.0,"MOVEMENT / CALIBER","国家と英国、時計製造の歴史"],
    [52.2,54.0,"CROWN / CASE","時代を刻んだディテール"], [54.2,56.0,"BRACELET / CLASP","受け継がれてきた個体の証"],
    [56.2,58.8,"ROLEX Ref.1665/0","時を超え、物語を宿す一本"], [59.07,61.45,"POWER WATCH",""]
  ];
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Main,Yu Gothic UI,48,&H00F5F2ED,&H000000FF,&H90000000,&H50000000,-1,0,0,0,100,100,1,0,1,2,0,2,88,88,260,1\nStyle: Title,Georgia,50,&H00D8B873,&H000000FF,&H90000000,&H40000000,-1,0,0,0,100,100,4,0,1,2,0,2,80,80,335,1\nStyle: Brand,Georgia,72,&H00D8B873,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,8,0,1,0,0,5,80,80,0,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${events.map(([start,end,title,body]) => title === "POWER WATCH" ? `Dialogue: 0,${tc(start)},${tc(end)},Brand,,0,0,0,,{\\fad(450,500)}POWER WATCH` : `Dialogue: 0,${tc(start)},${tc(end)},Title,,0,0,0,,{\\fad(180,220)}${title}\\N{\\rMain}${body}`).join("\n")}\n`;
}
function tc(seconds) { const h = Math.floor(seconds/3600), m = Math.floor((seconds%3600)/60), s = (seconds%60).toFixed(2).padStart(5,"0"); return `${h}:${String(m).padStart(2,"0")}:${s}`; }
