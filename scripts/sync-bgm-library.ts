import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import manifest from "../system-assets/bgm/library.json";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const accountId = required("R2_ACCOUNT_ID");
  const bucket = required("R2_BUCKET_NAME");
  const databaseUrl = required("DATABASE_URL");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    for (const item of manifest) {
      const localPath = path.resolve("system-assets", "bgm", item.fileName);
      const details = await stat(localPath);
      if (details.size !== item.sizeBytes)
        throw new Error(`SIZE_MISMATCH:${item.fileName}:${details.size}:${item.sizeBytes}`);
      const filePath = `system-assets/bgm/${item.fileName}`;
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: filePath,
          Body: await readFile(localPath),
          ContentType: "audio/mpeg",
          Metadata: { library: "approved-bgm", key: item.key },
        }),
      );
      await sql`
        INSERT INTO bgm_assets (
          key, name, file_path, extension, mime_type, size_bytes, duration_ms,
          sample_rate, channels, genre, mood, tags, suitable_styles, analysis, active, updated_at
        ) VALUES (
          ${item.key}, ${item.name}, ${filePath}, ${".mp3"}, ${"audio/mpeg"}, ${item.sizeBytes},
          ${item.durationMs}, ${item.sampleRate}, ${item.channels}, ${item.genre}, ${item.mood},
          ${sql.json(item.tags)}, ${sql.json(item.suitableStyles)}, ${sql.json(item.analysis)}, true, now()
        )
        ON CONFLICT (key) DO UPDATE SET
          name = EXCLUDED.name,
          file_path = EXCLUDED.file_path,
          extension = EXCLUDED.extension,
          mime_type = EXCLUDED.mime_type,
          size_bytes = EXCLUDED.size_bytes,
          duration_ms = EXCLUDED.duration_ms,
          sample_rate = EXCLUDED.sample_rate,
          channels = EXCLUDED.channels,
          genre = EXCLUDED.genre,
          mood = EXCLUDED.mood,
          tags = EXCLUDED.tags,
          suitable_styles = EXCLUDED.suitable_styles,
          analysis = EXCLUDED.analysis,
          updated_at = now()
      `;
      console.log(`Synced ${item.key} -> ${filePath}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
