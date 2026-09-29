import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = process.cwd();
const ffmpeg = path.join(
  path.dirname(require.resolve("@ffmpeg-installer/win32-x64/package.json")),
  "ffmpeg.exe",
);
const work = path.join(root, "artifacts", "gold-khanjar-work");
const assets = path.join(root, "client-demo", "gold-khanjar", "assets");
const opening = path.join(root, "assets", "opening", "opening-master.mp4");
const narration = path.join(
  root,
  "client-demo",
  "gold-khanjar",
  "audio",
  "narration-piper-male.wav",
);
const output = path.join(root, "artifacts", "gold-khanjar-demo-60s-final.mp4");
const font = "C\\:/Windows/Fonts/meiryo.ttc";
mkdirSync(work, { recursive: true });

function run(args, timeout = 900_000) {
  const result = spawnSync(ffmpeg, args, {
    cwd: root,
    encoding: "utf8",
    timeout,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`FFmpeg failed (${result.status}):\n${(result.stderr || result.stdout).slice(-6000)}`);
  }
}

function videoCodecArgs() {
  return [
    "-r", "24", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
    "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart",
  ];
}

function escapeText(text) {
  return text.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "’");
}

function labelFilter(title, kicker = "") {
  const safeTitle = escapeText(title);
  const safeKicker = escapeText(kicker);
  const parts = [
    `drawbox=x=72:y=144:w=6:h=96:color=0xc7a65a@0.95:t=fill`,
    `drawtext=fontfile='${font}':text='${safeTitle}':x=104:y=142:fontsize=43:fontcolor=white`,
  ];
  if (safeKicker) {
    parts.push(
      `drawtext=fontfile='${font}':text='${safeKicker}':x=106:y=205:fontsize=23:fontcolor=0xd5bd82`,
    );
  }
  return parts.join(",");
}

function renderHistory(out) {
  if (existsSync(out)) return;
  const filter = [
    "[0:v]noise=alls=16:allf=t+u,gblur=sigma=1.2,eq=contrast=1.12:saturation=0.7",
    "drawgrid=width=180:height=180:thickness=1:color=0xc7a65a@0.09",
    `drawtext=fontfile='${font}':text='1970s':x=72:y=144:fontsize=104:fontcolor=0xd7bd7a`,
    `drawtext=fontfile='${font}':text='OMAN':x=118:y=690:fontsize=52:fontcolor=white:enable='gte(t,0.5)'`,
    `drawtext=fontfile='${font}':text='UNITED KINGDOM':x=525:y=1010:fontsize=38:fontcolor=white:enable='gte(t,1.8)'`,
    "drawbox=x=240:y=804:w='min(530,max(0,(t-0.8)*250))':h=3:color=0xc7a65a@0.9:t=fill",
    "drawbox=x=765:y=804:w=3:h='min(190,max(0,(t-2.6)*170))':color=0xc7a65a@0.9:t=fill",
    `drawtext=fontfile='${font}':text='GIFT':x=430:y=1230:fontsize=58:fontcolor=0xd7bd7a:enable='gte(t,3.5)'`,
    "drawbox=x=365:y=1322:w='min(350,max(0,(t-3.7)*260))':h=2:color=white@0.65:t=fill",
    "vignette=PI/4,fade=t=in:st=0:d=0.25,fade=t=out:st=5.75:d=0.25,format=yuv420p[v]",
  ].join(",");
  run(["-y", "-f", "lavfi", "-i", "color=c=0x17130f:s=1080x1920:r=24:d=6", "-filter_complex", filter, "-map", "[v]", "-t", "6", ...videoCodecArgs(), out]);
}

function renderPhoto(source, duration, out, title, kicker = "", pan = "right") {
  if (existsSync(out)) return;
  const frames = Math.round(duration * 24);
  const x = pan === "left"
    ? `iw/2-(iw/zoom/2)-18*(on/${frames})`
    : `iw/2-(iw/zoom/2)+18*(on/${frames})`;
  const filter = [
    "[0:v]split=2[bg0][fg0]",
    "[bg0]scale=1920:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=42,eq=brightness=-0.5:saturation=0.35[bg]",
    `[fg0]scale=1400:1400,zoompan=z='1+0.075*(on/${Math.max(1, frames - 1)})':x='${x}':y='ih/2-(ih/zoom/2)':d=1:s=1080x1080:fps=24,eq=contrast=1.035:saturation=0.96[fg]`,
    `[bg][fg]overlay=0:420,drawbox=x=0:y=418:w=1080:h=2:color=0xc7a65a@0.45:t=fill,drawbox=x=0:y=1500:w=1080:h=2:color=0xc7a65a@0.45:t=fill,${labelFilter(title, kicker)},noise=alls=2.2:allf=t+u,vignette=PI/5,fade=t=in:st=0:d=0.18,fade=t=out:st=${Math.max(0, duration - 0.18)}:d=0.18,format=yuv420p[v]`,
  ].join(";");
  run(["-y", "-loop", "1", "-framerate", "24", "-t", String(duration), "-i", source, "-filter_complex", filter, "-map", "[v]", "-t", String(duration), ...videoCodecArgs(), out]);
}

const clips = [];
function next(name) {
  const file = path.join(work, `${String(clips.length + 1).padStart(2, "0")}-${name}.mp4`);
  clips.push(file);
  return file;
}

renderHistory(next("history"));
renderPhoto(path.join(assets, "1.jpg"), 6, next("asprey-rolex"), "ASPREY × ROLEX", "LONDON / SPECIAL COMMISSION", "left");
renderPhoto(path.join(assets, "MG_1220.jpg"), 7, next("gold-khanjar"), "GOLD KHANJAR", "THE EMBLEM ON THE DIAL", "right");
renderPhoto(path.join(assets, "MG_1220.jpg"), 1.75, next("proof-khanjar"), "01  KHANJAR", "PROVIDED DESCRIPTION CHECKPOINT", "left");
renderPhoto(path.join(assets, "MG_1204.jpg"), 1.75, next("proof-asprey"), "02  ASPREY", "PROVIDED DESCRIPTION CHECKPOINT", "right");
renderPhoto(path.join(assets, "MG_1202.jpg"), 1.75, next("proof-serial"), "03  SERIAL", "PROVIDED DESCRIPTION CHECKPOINT", "left");
renderPhoto(path.join(assets, "MG_1202.jpg"), 1.75, next("proof-series"), "04  5,000,000 SERIES", "PROVIDED DESCRIPTION CHECKPOINT", "right");
renderPhoto(path.join(assets, "MG_1220.jpg"), 2.5, next("detail-khanjar"), "01", "KHANJAR", "right");
renderPhoto(path.join(assets, "MG_1204.jpg"), 2.5, next("detail-asprey"), "02", "ASPREY", "left");
renderPhoto(path.join(assets, "MG_1202.jpg"), 2.5, next("detail-serial"), "03", "SERIAL / 1665", "right");
renderPhoto(path.join(assets, "MG_1202.jpg"), 2.5, next("detail-series"), "04", "5,000,000 SERIES", "left");
renderPhoto(path.join(assets, "MG_1200.jpg"), 5 / 3, next("movement"), "MOVEMENT", "MECHANICAL DETAIL", "right");
renderPhoto(path.join(assets, "MG_1216.jpg"), 5 / 3, next("crown"), "CROWN", "CASE PROFILE", "left");
renderPhoto(path.join(assets, "MG_1212.jpg"), 5 / 3, next("clasp"), "CLASP", "ROLEX CROWN", "right");
renderPhoto(path.join(assets, "1.jpg"), 4, next("hero"), "GOLD KHANJAR", "ROLEX 1665/0", "left");

const concatList = path.join(work, "body-clips.txt");
writeFileSync(concatList, clips.map((file) => `file '${file.replaceAll("\\", "/")}'`).join("\n"));
const silentBody = path.join(work, "body-silent.mp4");
run(["-y", "-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", silentBody]);

const subtitles = path.join(work, "body.ass");
writeFileSync(subtitles, `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: JP,Meiryo,44,&H00FFFFFF,&H000000FF,&HCC000000,&H88000000,0,0,0,0,100,100,0,0,3,1,0,2,78,78,245,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
Dialogue: 0,0:00:00.20,0:00:05.90,JP,,0,0,0,,1970年代、オマーンを率いたカーブース国王は、\\N英国との深い関係の中で、功労者たちへ特別な贈り物を届けました。
Dialogue: 0,0:00:06.10,0:00:11.90,JP,,0,0,0,,その一つが、英国の名門ジュエラー、\\Nアスプレイを通じて製作された特別なロレックス。
Dialogue: 0,0:00:12.10,0:00:18.90,JP,,0,0,0,,文字盤に刻まれたのは、オマーンを象徴する国章、\\Nゴールド・カンジャル。
Dialogue: 0,0:00:19.10,0:00:25.90,JP,,0,0,0,,しかし、その希少性ゆえに、\\N真贋を見極める証も重要になります。
Dialogue: 0,0:00:26.10,0:00:35.90,JP,,0,0,0,,厚みを持って描かれたカンジャル。裏蓋のASPREY刻印。\\N裏蓋内部のシリアル。そして500万番台の番号。
Dialogue: 0,0:00:36.10,0:00:40.90,JP,,0,0,0,,今回の1665/0には、\\Nその物語を示すディテールが残されています。
Dialogue: 0,0:00:41.10,0:00:44.85,JP,,0,0,0,,国家と英国、そして時計製造の歴史が交差した一本。\\NGOLD KHANJAR。その物語が、ここに残っています。
`, "utf8");

const body = path.join(work, "body-master-compatible.mp4");
const assPath = subtitles.replaceAll("\\", "/").replace(":", "\\:").replaceAll("'", "\\'");
const audioFilter = [
  "[1:a]atempo=1.05,atrim=0:45,asetpts=PTS-STARTPTS,apad,atrim=0:45,loudnorm=I=-16:TP=-1.5:LRA=9,aformat=sample_fmts=fltp:sample_rates=32000:channel_layouts=stereo,asplit=2[narr][side]",
  "[2:a]highpass=f=35,lowpass=f=5200,volume=0.09,aformat=sample_fmts=fltp:sample_rates=32000:channel_layouts=stereo[bgm]",
  "[bgm][side]sidechaincompress=threshold=0.018:ratio=10:attack=25:release=500[ducked]",
  "[3:a]highpass=f=55,lowpass=f=8000,volume=0.16[se]",
  "[narr][ducked][se]amix=inputs=3:duration=longest,highpass=f=25,loudnorm=I=-14:TP=-1:LRA=9,alimiter=limit=0.89[aout]",
].join(";");
const bgm = "aevalsrc='(0.035*sin(2*PI*55*t)+0.020*sin(2*PI*82.41*t)+0.011*sin(2*PI*110*t)+0.006*sin(2*PI*164.81*t))*(0.72+0.28*sin(2*PI*0.035*t))':s=32000:c=stereo";
const events = [0.7, 2.2, 4.0, 6.1, 12.2, 19.1, 20.85, 22.6, 24.35, 26.1, 28.6, 31.1, 33.6, 36.1, 37.77, 39.43, 41.1];
const terms = events.map((start, index) => {
  const freq = index === events.length - 1 ? 72 : index % 3 === 0 ? 880 : 1320;
  return `(0.055*sin(2*PI*${freq}*t)+0.012*(2*random(0)-1))*exp(-18*max(0\\,t-${start}))*between(t\\,${start}\\,${start + 0.35})`;
});
terms.push("0.018*(2*random(0)-1)*between(t\\,0.8\\,1.8)");
const se = `aevalsrc='${terms.join("+")}':s=32000:c=stereo`;
run([
  "-y", "-i", silentBody, "-i", narration,
  "-f", "lavfi", "-t", "45", "-i", bgm,
  "-f", "lavfi", "-t", "45", "-i", se,
  "-filter_complex", `[0:v]subtitles=filename='${assPath}'[vout];${audioFilter}`,
  "-map", "[vout]", "-map", "[aout]", "-t", "45", "-r", "24",
  "-c:v", "libx265", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p10le",
  "-tag:v", "hvc1", "-video_track_timescale", "12288",
  "-c:a", "aac", "-b:a", "192k", "-ar", "32000", "-ac", "2", "-movflags", "+faststart", body,
], 1_800_000);

function toTransport(input, out) {
  run(["-y", "-i", input, "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-bsf:v", "hevc_mp4toannexb", "-f", "mpegts", out]);
}
const openingTs = path.join(work, "opening.ts");
const bodyTs = path.join(work, "body.ts");
const combinedTs = path.join(work, "combined.ts");
toTransport(opening, openingTs);
toTransport(body, bodyTs);
copyFileSync(openingTs, combinedTs);
appendFileSync(combinedTs, readFileSync(bodyTs));
run(["-y", "-fflags", "+genpts", "-i", combinedTs, "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-movflags", "+faststart", output]);

for (const file of [openingTs, bodyTs, combinedTs]) rmSync(file, { force: true });
console.log(output);
