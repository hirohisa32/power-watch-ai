import { OPENING_MASTER_METADATA } from "./template";

export type WatchAngleRole = "side" | "back" | "movement" | "oblique" | "obliqueMacro" | "front" | "macro";

export type WatchMotionSegment = {
  role: WatchAngleRole;
  start: number;
  end: number;
  crossfade: number;
  zoomStart: number;
  zoomEnd: number;
  rotationStart: number;
  rotationEnd: number;
  centerXStart: number;
  centerXEnd: number;
  centerYStart: number;
  centerYEnd: number;
  visibleAngleStart: number;
  visibleAngleEnd: number;
  blurStart: number;
  blurEnd: number;
};

export const WATCH_MOTION_SEGMENTS: readonly WatchMotionSegment[] = [
  { role: "side", start: 9.25, end: 9.84, crossfade: 0.16, zoomStart: 1.0, zoomEnd: 1.38, rotationStart: -0.19, rotationEnd: -0.17, centerXStart: 0.51, centerXEnd: 0.508, centerYStart: 0.565, centerYEnd: 0.535, visibleAngleStart: 82, visibleAngleEnd: 72, blurStart: 2.4, blurEnd: 2.1 },
  { role: "back", start: 9.68, end: 10.20, crossfade: 0.16, zoomStart: 1.28, zoomEnd: 1.72, rotationStart: -0.18, rotationEnd: -0.145, centerXStart: 0.508, centerXEnd: 0.505, centerYStart: 0.54, centerYEnd: 0.515, visibleAngleStart: 74, visibleAngleEnd: 61, blurStart: 2.2, blurEnd: 1.8 },
  { role: "movement", start: 10.04, end: 10.60, crossfade: 0.16, zoomStart: 1.60, zoomEnd: 2.08, rotationStart: -0.15, rotationEnd: -0.12, centerXStart: 0.505, centerXEnd: 0.505, centerYStart: 0.518, centerYEnd: 0.49, visibleAngleStart: 64, visibleAngleEnd: 52, blurStart: 1.9, blurEnd: 1.55 },
  { role: "oblique", start: 10.44, end: 11.10, crossfade: 0.16, zoomStart: 1.94, zoomEnd: 2.60, rotationStart: -0.125, rotationEnd: -0.09, centerXStart: 0.505, centerXEnd: 0.51, centerYStart: 0.495, centerYEnd: 0.468, visibleAngleStart: 55, visibleAngleEnd: 39, blurStart: 1.65, blurEnd: 1.28 },
  { role: "obliqueMacro", start: 10.94, end: 11.58, crossfade: 0.16, zoomStart: 2.44, zoomEnd: 3.18, rotationStart: -0.095, rotationEnd: -0.065, centerXStart: 0.51, centerXEnd: 0.51, centerYStart: 0.47, centerYEnd: 0.455, visibleAngleStart: 42, visibleAngleEnd: 29, blurStart: 1.38, blurEnd: 1.05 },
  { role: "front", start: 11.42, end: 12.84, crossfade: 0.18, zoomStart: 3.0, zoomEnd: 4.32, rotationStart: -0.07, rotationEnd: -0.025, centerXStart: 0.51, centerXEnd: 0.50, centerYStart: 0.46, centerYEnd: 0.48, visibleAngleStart: 32, visibleAngleEnd: 13, blurStart: 1.15, blurEnd: 0.65 },
  { role: "macro", start: 12.66, end: 14.58, crossfade: 0.18, zoomStart: 4.08, zoomEnd: 6.0, rotationStart: -0.03, rotationEnd: 0, centerXStart: 0.50, centerXEnd: 0.50, centerYStart: 0.48, centerYEnd: 0.50, visibleAngleStart: 15, visibleAngleEnd: 3, blurStart: 0.72, blurEnd: 0.28 },
] as const;

export const WATCH_ASSET_ROLE_RULES: Record<WatchAngleRole, RegExp> = {
  side: /side|profile|case\s*side|横|側面|crown|c6b1/i,
  back: /case.?back|裏蓋|33e442/i,
  movement: /movement|caliber|ムーブメント|5dd1e5/i,
  oblique: /oblique|three.?quarter|angle|斜め|c88eb/i,
  obliqueMacro: /oblique.?macro|斜め寄り|0f0b/i,
  front: /front|hero|full|正面|88b0/i,
  macro: /macro|dial|close|寄り|文字盤|376f/i,
};

export function chooseWatchRole(label: string, index: number): WatchAngleRole | null {
  if (/wrist|腕|human|着用/i.test(label)) return null;
  for (const role of ["side", "back", "movement", "oblique", "obliqueMacro", "front", "macro"] as const)
    if (WATCH_ASSET_ROLE_RULES[role].test(label)) return role;
  return (["front", "oblique", "macro", "side", "back", "movement", "obliqueMacro"] as const)[index % 7];
}

export function buildFrameMotionTrack() {
  const fps = OPENING_MASTER_METADATA.fps;
  const first = Math.round(OPENING_MASTER_METADATA.watchRevealStartSeconds * fps);
  const last = Math.round(OPENING_MASTER_METADATA.watchRevealEndSeconds * fps);
  return Array.from({ length: last - first + 1 }, (_, offset) => {
    const frame = first + offset;
    const time = frame / fps;
    const segment = WATCH_MOTION_SEGMENTS.find((item) => time >= item.start && time <= item.end) ?? WATCH_MOTION_SEGMENTS.at(-1)!;
    const p = Math.min(1, Math.max(0, (time - segment.start) / (segment.end - segment.start)));
    const ease = p * p * (3 - 2 * p);
    const lerp = (a: number, b: number) => a + (b - a) * ease;
    const scale = lerp(segment.zoomStart, segment.zoomEnd);
    const previousP = Math.max(0, p - 1 / ((segment.end - segment.start) * fps));
    const previousEase = previousP * previousP * (3 - 2 * previousP);
    const previousScale = segment.zoomStart + (segment.zoomEnd - segment.zoomStart) * previousEase;
    const velocity = (scale - previousScale) * fps;
    return {
      frame,
      time: Number(time.toFixed(4)),
      position: { x: Number(lerp(segment.centerXStart, segment.centerXEnd).toFixed(5)), y: Number(lerp(segment.centerYStart, segment.centerYEnd).toFixed(5)) },
      scale: Number(scale.toFixed(5)),
      rotationRadians: Number(lerp(segment.rotationStart, segment.rotationEnd).toFixed(5)),
      perspective: { yawDegrees: Number(lerp(segment.visibleAngleStart, segment.visibleAngleEnd).toFixed(3)), pitchDegrees: Number(lerp(-8, 0).toFixed(3)) },
      velocity: Number(velocity.toFixed(5)),
      acceleration: Number(((segment.zoomEnd - segment.zoomStart) * (6 - 12 * p) / Math.pow(segment.end - segment.start, 2)).toFixed(5)),
      blur: Number(lerp(segment.blurStart, segment.blurEnd).toFixed(3)),
      depthFocus: Number(lerp(0.42, 0.92).toFixed(3)),
      visibleAngle: Number(lerp(segment.visibleAngleStart, segment.visibleAngleEnd).toFixed(3)),
      preferredRole: segment.role,
    };
  });
}
