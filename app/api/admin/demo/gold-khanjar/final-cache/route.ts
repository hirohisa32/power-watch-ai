import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { finalRenders } from "@/lib/db/schema";
import { assertSameOrigin } from "@/lib/security";
import { isAdminEmail } from "@/lib/ui/presentation";

const RENDER_ID = "de0b7b81-030e-4c6d-956b-ddfbbe1aa3f3";
const SIZE = 30_432_947;
const KEY = `projects/781778f5-42aa-4a23-9f0f-6a8c0e95ad8a/renders/${RENDER_ID}.mp4`;

function r2() {
  const accountId = process.env.R2_ACCOUNT_ID; const accessKeyId = process.env.R2_ACCESS_KEY_ID; const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY; const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) throw new Error("R2_NOT_CONFIGURED");
  return { bucket, client: new S3Client({ region: "auto", endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } }) };
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  return null;
}

export async function GET() {
  const denied = await requireAdmin(); if (denied) return denied;
  const { bucket, client } = r2();
  const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: KEY, ContentType: "video/mp4" }), { expiresIn: 300 });
  return NextResponse.json({ uploadUrl, size: SIZE });
}

export async function POST(request: Request) {
  await assertSameOrigin(request);
  const denied = await requireAdmin(); if (denied) return denied;
  const { bucket, client } = r2();
  const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: KEY }));
  if (object.ContentLength !== SIZE || object.ContentType !== "video/mp4") return NextResponse.json({ error: "R2上の修復済みFinal MP4を確認できません" }, { status: 409 });
  const [render] = await getDb().select({ id: finalRenders.id, outputObjectKey: finalRenders.outputObjectKey }).from(finalRenders).where(eq(finalRenders.id, RENDER_ID)).limit(1);
  if (!render?.outputObjectKey || render.outputObjectKey !== KEY) return NextResponse.json({ error: "対象Final Renderが見つかりません" }, { status: 404 });
  await getDb().update(finalRenders).set({ durationMs: 65160, updatedAt: new Date() }).where(eq(finalRenders.id, RENDER_ID));
  return NextResponse.json({ repaired: true });
}
