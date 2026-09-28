import type { FinalRenderInput } from "./types";

export function createAssSubtitles(input: FinalRenderInput) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Subtitle,Noto Sans JP,58,&H00FFFFFF,&H00FFFFFF,&HCC000000,&H99000000,-1,0,0,0,100,100,1,0,3,2,0,2,92,92,300,1
Style: Meta,Noto Sans JP,66,&H00FFFFFF,&H00FFFFFF,&HAA000000,&H66000000,-1,0,0,0,100,100,3,0,1,3,0,7,90,90,210,1
Style: Brand,Noto Sans JP,92,&H00FFFFFF,&H00FFFFFF,&HAA000000,&H44000000,-1,0,0,0,100,100,8,0,1,3,0,5,80,80,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;
  const events: string[] = [];
  for (const cue of input.subtitles) {
    events.push(
      `Dialogue: 10,${assTime(cue.startMs)},${assTime(cue.endMs)},Subtitle,,0,0,0,,${escapeAss(cue.text)}`,
    );
  }
  for (const overlay of input.overlays) {
    const style = overlay.kind === "brand" ? "Brand" : "Meta";
    const text = [overlay.primary, overlay.secondary].filter(Boolean).map(escapeAss).join("\\N");
    events.push(
      `Dialogue: 20,${assTime(overlay.startMs)},${assTime(overlay.endMs)},${style},,0,0,0,,${text}`,
    );
  }
  return `${header}\n${events.join("\n")}\n`;
}

function assTime(ms: number) {
  const centiseconds = Math.max(0, Math.round(ms / 10));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const seconds = Math.floor((centiseconds % 6000) / 100);
  const fraction = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(fraction).padStart(2, "0")}`;
}

function escapeAss(text: string | undefined) {
  const escaped = (text || "")
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\r?\n/g, "\\N")
    .trim();
  if (escaped.includes("\\N") || [...escaped].length <= 22) return escaped;
  const midpoint = Math.floor([...escaped].length / 2);
  const breakpoints = [...escaped]
    .map((character, index) => ({ character, index }))
    .filter(({ character }) => /[、。！？,.!? ]/.test(character));
  const splitAt = breakpoints.sort(
    (a, b) => Math.abs(a.index - midpoint) - Math.abs(b.index - midpoint),
  )[0]?.index;
  if (!splitAt || splitAt < 8 || splitAt > [...escaped].length - 8) return escaped;
  return `${[...escaped].slice(0, splitAt + 1).join("")}\\N${[...escaped]
    .slice(splitAt + 1)
    .join("")}`;
}
