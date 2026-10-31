import { createHash, timingSafeEqual } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { createReadUrl } from "@/lib/storage";

const TOKEN_HASH = "3e7e057d128356040e0c733e9a8e2be4568823d1785b360a387d9553052720b9";
const TOKEN_NOT_AFTER = Date.parse("2026-10-31T06:29:23.241Z");
const ASSETS = {
  opening_power_watch: "system-assets/opening/opening_power_watch.mp4",
  opening_cool_vintage_watch: "system-assets/opening/opening_cool_vintage_watch.mp4",
  opening_trust_watch: "system-assets/opening/opening_trust_watch.mp4",
  ending_power_watch: "system-assets/ending/ending_power_watch.mp4",
  ending_cool_vintage_watch: "system-assets/ending/ending_cool_vintage_watch.mp4",
  ending_trust_watch: "system-assets/ending/ending_trust_watch.mp4",
} as const;

function authorized(request: Request) {
  if (Date.now() > TOKEN_NOT_AFTER) return false;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(TOKEN_HASH, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function r2() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) throw new Error("R2_NOT_CONFIGURED");
  return {
    bucket,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { client, bucket } = r2();
  const items = await Promise.all(
    Object.entries(ASSETS).map(async ([key, storagePath]) => ({
      key,
      storagePath,
      uploadUrl: await getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: bucket, Key: storagePath, ContentType: "video/mp4" }),
        { expiresIn: 600 },
      ),
    })),
  );
  return NextResponse.json({ items });
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await Promise.all(
    Object.entries(ASSETS).map(async ([key, storagePath]) => ({
      key,
      storagePath,
      previewUrl: await createReadUrl(storagePath, 600),
    })),
  );
  return NextResponse.json({ items });
}
