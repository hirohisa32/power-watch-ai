import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createNormalizedWatchCutout } from "../lib/opening/cutout";
import { inspectOpeningAudio, renderOpeningPreview, type WatchCutout } from "../lib/opening/ffmpeg";
import { buildFrameMotionTrack, WATCH_MOTION_SEGMENTS, type WatchAngleRole } from "../lib/opening/motion";
import { openingMasterSystemPath } from "../lib/opening/template";

const PIERCE_ASSETS: Array<{ file: string; role: WatchAngleRole }> = [
  { file: "c6b1af4db19cfc9d658eaddb4ab2d033-1.png", role: "side" },
  { file: "33e442c4fb6dd447577c3b317cab27f5.png", role: "back" },
  { file: "5dd1e5beaaae230e8344dd599d76186a.png", role: "movement" },
  { file: "c88eb43f47ad7a16138dc92025ec7da9-1.png", role: "oblique" },
  { file: "0f0b93003df68872932fe3253fcd2603-1.png", role: "obliqueMacro" },
  { file: "88b0a1b051d4188f6d1a59231b1d76d1-1.png", role: "front" },
  { file: "376ff2af9c9e41837aabea64e4f3de74-2.png", role: "macro" },
];

async function main() {
  const output = path.resolve(process.argv[2] ?? "artifacts/opening-pierce-confirmation-v3.mp4");
  const assetsDir = path.resolve("client-demo/assets");
  const workDir = path.join(path.dirname(output), "opening-pierce-v3-assets");
  await mkdir(workDir, { recursive: true });
  const cutouts: WatchCutout[] = [];
  for (const asset of PIERCE_ASSETS) {
    const source = path.join(assetsDir, asset.file);
    const destination = path.join(workDir, `${asset.role}-${path.parse(asset.file).name}.png`);
    await writeFile(destination, await createNormalizedWatchCutout(new Uint8Array(await readFile(source))));
    cutouts.push({ path: destination, role: asset.role });
  }
  await writeFile(openingMasterSystemPath("original-watch-motion-track.json"), JSON.stringify({ version: 3, fps: 24, frames: buildFrameMotionTrack() }, null, 2));
  await writeFile(openingMasterSystemPath("watch-angle-map.json"), JSON.stringify({ version: 3, sourceAssets: PIERCE_ASSETS, segments: WATCH_MOTION_SEGMENTS }, null, 2));
  await renderOpeningPreview({ watchlessMaster: openingMasterSystemPath("watchless-master.mp4"), watchCutouts: cutouts, audioMaster: openingMasterSystemPath("audio-master-v3.wav"), output });
  const audio = await inspectOpeningAudio(output);
  console.log(JSON.stringify({ output, cutouts, frames: buildFrameMotionTrack().length, audio }, null, 2));
}

void main();
