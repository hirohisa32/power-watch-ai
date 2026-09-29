import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createConnectedBackgroundCutout } from "../lib/opening/cutout";
import { inspectOpeningAudio, renderOpeningPreview } from "../lib/opening/ffmpeg";
import { openingMasterSystemPath } from "../lib/opening/template";

async function main() {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) throw new Error("Usage: pnpm opening:preview <watch-image> <output.mp4>");
  const absoluteInput = path.resolve(input);
  const absoluteOutput = path.resolve(output);
  await mkdir(path.dirname(absoluteOutput), { recursive: true });
  const cutout = await createConnectedBackgroundCutout(new Uint8Array(await readFile(absoluteInput)));
  const cutoutPath = absoluteOutput.replace(/\.mp4$/i, "-watch-cutout.png");
  await writeFile(cutoutPath, cutout);
  await renderOpeningPreview({
    masterVideo: openingMasterSystemPath("video.mp4"),
    watchCutout: cutoutPath,
    audioMaster: openingMasterSystemPath("audio-master.wav"),
    output: absoluteOutput,
  });
  const audio = await inspectOpeningAudio(absoluteOutput);
  console.log(JSON.stringify({ output: absoluteOutput, cutout: cutoutPath, audio }, null, 2));
}

void main();
