import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/700.css";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, useCurrentFrame } from "remotion";
import type { SubtitleCue } from "@/lib/audio/timing";
import type { TextOverlay } from "@/lib/render/types";

export type FinalCompositionProps = {
  fps: number;
  scenes: Array<{ url: string; duration: number }>;
  narrationUrl: string;
  bgmUrl?: string;
  subtitles: SubtitleCue[];
  overlays: TextOverlay[];
};

export function FinalComposition(props: FinalCompositionProps) {
  const frame = useCurrentFrame();
  const nowMs = (frame / props.fps) * 1000;
  const startFrames = props.scenes.map((_, index) =>
    props.scenes
      .slice(0, index)
      .reduce((sum, scene) => sum + Math.round(scene.duration * props.fps), 0),
  );
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: '"Noto Sans JP", sans-serif' }}>
      {props.scenes.map((scene, index) => {
        const durationInFrames = Math.round(scene.duration * props.fps);
        const from = startFrames[index];
        return (
          <Sequence key={`${scene.url}-${index}`} from={from} durationInFrames={durationInFrames}>
            <OffthreadVideo
              src={scene.url}
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </Sequence>
        );
      })}
      <Audio src={props.narrationUrl} volume={1} />
      {props.bgmUrl && <Audio src={props.bgmUrl} volume={0.1} />}
      {props.subtitles
        .filter((cue) => nowMs >= cue.startMs && nowMs < cue.endMs)
        .map((cue) => (
          <div
            key={`${cue.sceneId}-${cue.startMs}`}
            style={{
              position: "absolute",
              left: 112,
              right: 112,
              bottom: 330,
              padding: "16px 22px",
              color: "white",
              background: "rgba(0,0,0,.65)",
              fontSize: 52,
              fontWeight: 700,
              lineHeight: 1.45,
              textAlign: "center",
              textShadow: "0 2px 8px #000",
            }}
          >
            {cue.text}
          </div>
        ))}
      {props.overlays
        .filter((overlay) => nowMs >= overlay.startMs && nowMs < overlay.endMs)
        .map((overlay) => (
          <div
            key={`${overlay.kind}-${overlay.startMs}`}
            style={
              overlay.kind === "brand"
                ? {
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: 82,
                    fontWeight: 700,
                    letterSpacing: "0.18em",
                  }
                : {
                    position: "absolute",
                    top: 210,
                    left: 90,
                    color: "white",
                    fontSize: 66,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    whiteSpace: "pre-line",
                  }
            }
          >
            {[overlay.primary, overlay.secondary].filter(Boolean).join("\n")}
          </div>
        ))}
    </AbsoluteFill>
  );
}
