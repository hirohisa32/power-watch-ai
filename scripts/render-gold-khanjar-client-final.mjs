import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ffmpeg = path.join(root, "node_modules", "@ffmpeg-installer", "win32-x64", "ffmpeg.exe");
const work = path.join(root, "artifacts", "gold-khanjar-client-final");
const clipsDir = path.join(work, "clips");
await mkdir(clipsDir, { recursive: true });

const source = (...parts) => path.join(root, ...parts);
const historical = source("artifacts", "gold-khanjar-client-final", "stylized-historical");
const masters = source("artifacts", "gold-khanjar-quality-preview", "stylized-masters-v2");
const sns = source("artifacts", "gold-khanjar-quality-preview", "sns-keyframes-v2");

const clips = [];
async function videoClip(name, input, duration, filter = "") {
  const output = path.join(clipsDir, `${String(clips.length).padStart(2, "0")}-${name}.mp4`);
  const vf = [
    "scale=1080:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920",
    filter,
    "fps=30",
    "format=yuv420p",
  ].filter(Boolean).join(",");
  if (!existsSync(output)) run(["-y", "-i", input, "-t", String(duration), "-an", "-vf", vf, "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
  clips.push({ name, duration, output });
}

async function imageClip(name, input, duration, motion = "push") {
  const frames = Math.round(duration * 30);
  const move = motion === "pull"
    ? "zoompan=z='if(eq(on,0),1.045,max(1.0,zoom-0.0005))':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=30"
    : motion === "rise"
      ? `zoompan=z='min(zoom+0.00045,1.04)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2-${frames > 1 ? `18*on/${frames - 1}` : "0"}':d=1:s=1080x1920:fps=30`
      : "zoompan=z='min(zoom+0.00055,1.045)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=30";
  const output = path.join(clipsDir, `${String(clips.length).padStart(2, "0")}-${name}.mp4`);
  if (!existsSync(output)) run(["-y", "-loop", "1", "-i", input, "-frames:v", String(frames), "-an", "-vf", ["scale=1200:2134:force_original_aspect_ratio=increase", "crop=1200:2134", move, "eq=contrast=1.025:saturation=0.94:brightness='0.002*sin(2*PI*t/3)'", "vignette=PI/5", "noise=alls=0.55:allf=t+u", "format=yuv420p"].join(","), "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
  clips.push({ name, duration, output });
}

await videoClip("fixed-opening", source("assets", "opening", "opening-master.mp4"), 15.07);
await videoClip("story-entry", source("artifacts", "gold-khanjar-quality-preview", "story-entry", "story-entry-only.mp4"), 2.5, "setpts=0.4166667*PTS");
await imageClip("oman", path.join(historical, "01-oman.png"), 3, "rise");
await imageClip("qaboos-era", path.join(historical, "02-qaboos.png"), 3, "push");
await imageClip("diplomacy", path.join(historical, "03-diplomacy.png"), 3, "pull");
await imageClip("asprey", path.join(historical, "04-asprey.png"), 3, "rise");
await imageClip("gift-preparation", path.join(historical, "05-gift.png"), 2.4, "push");
await imageClip("gift-delivery", path.join(historical, "05-gift.png"), 2.2, "pull");
await imageClip("watch-reveal", path.join(masters, "01-full-watch.png"), 1.8, "push");
await videoClip("watch-lift", path.join(sns, "watch-lift-identity-locked-preview.mp4"), 1.8);
await imageClip("reaction", path.join(sns, "reaction-safe-area-keyframe.png"), 1.8, "pull");
await imageClip("dial-macro", path.join(masters, "02-dial-macro.png"), 2.6, "push");
await imageClip("khanjar-focus", path.join(masters, "02-dial-macro.png"), 2.4, "rise");
await imageClip("outer-caseback", path.join(masters, "03-outer-caseback.png"), 2.5, "pull");
await imageClip("serial-5082955", path.join(masters, "04-inner-caseback-serial.png"), 2.5, "push");
await imageClip("movement", path.join(masters, "05-movement.png"), 2.5, "rise");
await imageClip("side-crown", path.join(masters, "06-side-crown.png"), 2, "pull");
await imageClip("bracelet-clasp", path.join(masters, "07-bracelet-clasp.png"), 2, "push");
await imageClip("product-hero", path.join(masters, "01-full-watch.png"), 3, "pull");

const ending = path.join(clipsDir, `${String(clips.length).padStart(2, "0")}-brand-ending.mp4`);
if (!existsSync(ending)) run(["-y", "-f", "lavfi", "-i", "color=c=#050505:s=1080x1920:r=30:d=2.5", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p", "-movflags", "+faststart", ending]);
clips.push({ name: "brand-ending", duration: 2.5, output: ending });

const concatFile = path.join(work, "concat.txt");
await writeFile(concatFile, clips.map((item) => `file '${item.output.replaceAll("'", "'\\''")}'`).join("\n") + "\n");
const baseVideo = path.join(work, "gold-khanjar-client-final-video-base.mp4");
run(["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", baseVideo]);

const subtitles = path.join(work, "gold-khanjar-client-final.ass");
await writeFile(subtitles, ass());
const subtitledVideo = path.join(work, "gold-khanjar-client-final-video.mp4");
run(["-y", "-i", baseVideo, "-vf", "ass=artifacts/gold-khanjar-client-final/gold-khanjar-client-final.ass", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p", "-movflags", "+faststart", subtitledVideo]);

const mixedAudio = path.join(work, "gold-khanjar-client-final-audio.m4a");
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

const final = path.join(work, "gold-khanjar-client-final.mp4");
run(["-y", "-i", subtitledVideo, "-i", mixedAudio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "copy", "-t", "61.57", "-movflags", "+faststart", final]);

const timeline = [];
let at = 0;
for (const clip of clips) { timeline.push({ ...clip, start: Number(at.toFixed(2)), end: Number((at + clip.duration).toFixed(2)) }); at += clip.duration; }
await writeFile(path.join(work, "final-manifest.json"), `${JSON.stringify({ final, durationSeconds: at, resolution: "1080x1920", fps: 30, narration: { model: "eleven_v4", voiceId: "Bj4Malc5SZLoXfPtxRxH", durationSeconds: 43.47, startSeconds: 15.2, regenerated: false }, bgm: { file: path.basename(bgm), startSeconds: 15.07, duckingDb: 5, fadeOutSeconds: 1.5 }, clips: timeline }, null, 2)}\n`);
console.log(JSON.stringify({ final, durationSeconds: at, clips: clips.length }, null, 2));

function run(args) {
  const result = spawnSync(ffmpeg, args, { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || `FFmpeg failed: ${args.join(" ")}`);
}
function ass() {
  const events = [
    [17.7,20.4,"1970s / OMAN","新しい時代を迎えたオマーン"],
    [20.6,23.4,"A NEW ERA","国に尽くした功労者へ"],
    [23.7,26.5,"OMAN × UNITED KINGDOM","特別な時計が贈られた"],
    [26.8,29.5,"ASPREY / LONDON","英国の名門ジュエラー、アスプレイ"],
    [31.0,34.0,"A SPECIAL GIFT","選ばれたのは、ロレックス"],
    [39.7,42.0,"GOLD KHANJAR","威信を象徴する金色のカンジャル"],
    [42.2,44.5,"THE EMBLEM","これは、ただの装飾ではない"],
    [44.7,47.0,"ASPREY","英国との結びつきを刻む証"],
    [47.2,49.5,"SERIAL 5082955 / 1665","500万番台のシリアル、そして1665/0"],
    [49.7,52.0,"MOVEMENT / CALIBER","国家と英国、時計製造の歴史"],
    [52.2,54.0,"CROWN / CASE","時代を刻んだディテール"],
    [54.2,56.0,"BRACELET / CLASP","受け継がれてきた個体の証"],
    [56.2,58.8,"ROLEX Ref.1665/0","時を超え、物語を宿す一本"],
    [59.07,61.45,"POWER WATCH",""]
  ];
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Main,Yu Gothic UI,48,&H00F5F2ED,&H000000FF,&H90000000,&H50000000,-1,0,0,0,100,100,1,0,1,2,0,2,88,88,260,1\nStyle: Title,Georgia,50,&H00D8B873,&H000000FF,&H90000000,&H40000000,-1,0,0,0,100,100,4,0,1,2,0,2,80,80,335,1\nStyle: Brand,Georgia,72,&H00D8B873,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,8,0,1,0,0,5,80,80,0,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${events.map(([start,end,title,body]) => {
    if (title === "POWER WATCH") return `Dialogue: 0,${tc(start)},${tc(end)},Brand,,0,0,0,,{\\fad(450,500)}POWER WATCH`;
    return `Dialogue: 0,${tc(start)},${tc(end)},Title,,0,0,0,,{\\fad(180,220)}${title}\\N{\\rMain}${body}`;
  }).join("\n")}\n`;
}
function tc(seconds) { const h = Math.floor(seconds/3600); const m = Math.floor((seconds%3600)/60); const s = (seconds%60).toFixed(2).padStart(5,"0"); return `${h}:${String(m).padStart(2,"0")}:${s}`; }
