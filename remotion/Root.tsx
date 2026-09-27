import { Composition, registerRoot } from "remotion";
import { FinalComposition, type FinalCompositionProps } from "./FinalComposition";

const defaultProps: FinalCompositionProps = {
  fps: 30,
  scenes: [],
  narrationUrl: "",
  subtitles: [],
  overlays: [],
};

export function RemotionRoot() {
  return (
    <Composition
      id="PowerWatchFinal"
      component={FinalComposition}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={1800}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(
          1,
          Math.round(props.scenes.reduce((sum, scene) => sum + scene.duration, 0) * props.fps),
        ),
      })}
    />
  );
}

registerRoot(RemotionRoot);
