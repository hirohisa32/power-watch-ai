import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
import { SYSTEM_VIDEO_ASSET_IDS } from "../lib/system-media/config";

for (const file of [".env.production.local", ".env.local"]) {
  try {
    loadEnvFile(path.resolve(file));
  } catch {
    // Production supplies environment variables directly; local files are optional.
  }
}

const sourceDir = process.env.SYSTEM_VIDEO_SOURCE_DIR || path.join(process.env.USERPROFILE || "", "Downloads");
const assets = [
  { id: SYSTEM_VIDEO_ASSET_IDS.openingPowerWatch, key: "opening_power_watch", type: "opening", brand: "power_watch", displayName: "Power Watch", source: path.resolve("assets/opening/opening-master.mp4"), storagePath: "system-assets/opening/opening_power_watch.mp4", durationMs: 15072, width: 1080, height: 1920, fps: 24, hasAudio: true },
  { id: SYSTEM_VIDEO_ASSET_IDS.openingCoolVintageWatch, key: "opening_cool_vintage_watch", type: "opening", brand: "cool_vintage_watch", displayName: "Cool Vintage Watch", source: path.join(sourceDir, "CoolVintageWatch用オープニング動画.mp4"), storagePath: "system-assets/opening/opening_cool_vintage_watch.mp4", durationMs: 15072, width: 720, height: 1280, fps: 24, hasAudio: true },
  { id: SYSTEM_VIDEO_ASSET_IDS.openingTrustWatch, key: "opening_trust_watch", type: "opening", brand: "trust_watch", displayName: "Trust Watch", source: path.join(sourceDir, "TrustWatch用オープニング動画.mp4"), storagePath: "system-assets/opening/opening_trust_watch.mp4", durationMs: 15072, width: 1080, height: 1920, fps: 24, hasAudio: true },
  { id: SYSTEM_VIDEO_ASSET_IDS.endingPowerWatch, key: "ending_power_watch", type: "ending", brand: "power_watch", displayName: "Power Watch", source: path.join(sourceDir, "PowerWatch用締め動画.mp4"), storagePath: "system-assets/ending/ending_power_watch.mp4", durationMs: 5000, width: 1080, height: 1920, fps: 30, hasAudio: false },
  { id: SYSTEM_VIDEO_ASSET_IDS.endingCoolVintageWatch, key: "ending_cool_vintage_watch", type: "ending", brand: "cool_vintage_watch", displayName: "Cool Vintage Watch", source: path.join(sourceDir, "CoolVintageWatch用締め動画.mp4"), storagePath: "system-assets/ending/ending_cool_vintage_watch.mp4", durationMs: 5000, width: 1080, height: 1920, fps: 30, hasAudio: false },
  { id: SYSTEM_VIDEO_ASSET_IDS.endingTrustWatch, key: "ending_trust_watch", type: "ending", brand: "trust_watch", displayName: "Trust Watch", source: path.join(sourceDir, "TrustWatch用締め動画.mp4"), storagePath: "system-assets/ending/ending_trust_watch.mp4", durationMs: 5000, width: 1080, height: 1920, fps: 30, hasAudio: false },
] as const;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const accountId = required("R2_ACCOUNT_ID");
  const bucket = required("R2_BUCKET_NAME");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
  const sql = postgres(required("DATABASE_URL"), { max: 1, prepare: false });
  try {
    for (const item of assets) {
      const details = await stat(item.source);
      if (!details.size) throw new Error(`EMPTY_ASSET:${item.source}`);
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: item.storagePath,
        Body: await readFile(item.source),
        ContentType: "video/mp4",
        Metadata: { systemAsset: item.key, brand: item.brand, type: item.type },
      }));
      await sql`
        INSERT INTO system_video_assets (
          id, key, type, brand, display_name, storage_path, duration_ms,
          width, height, fps, has_audio, active, updated_at
        ) VALUES (
          ${item.id}, ${item.key}, ${item.type}, ${item.brand}, ${item.displayName},
          ${item.storagePath}, ${item.durationMs}, ${item.width}, ${item.height}, ${item.fps},
          ${item.hasAudio}, true, now()
        )
        ON CONFLICT (key) DO UPDATE SET
          brand = EXCLUDED.brand, display_name = EXCLUDED.display_name,
          storage_path = EXCLUDED.storage_path, duration_ms = EXCLUDED.duration_ms,
          width = EXCLUDED.width, height = EXCLUDED.height, fps = EXCLUDED.fps,
          has_audio = EXCLUDED.has_audio, active = true, updated_at = now()
      `;
      console.log(`Synced ${item.key}: ${details.size} bytes -> ${item.storagePath}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
