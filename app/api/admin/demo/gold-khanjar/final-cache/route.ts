import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, S3Client, UploadPartCommand } from "@aws-sdk/client-s3";
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

export async function POST(request: Request) {
  await assertSameOrigin(request);
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  const action = request.headers.get("x-upload-action"); const { bucket, client } = r2();
  if (action === "init") {
    if (Number(request.headers.get("x-file-size")) !== SIZE) return NextResponse.json({ error: "Final MP4サイズが一致しません" }, { status: 400 });
    const created = await client.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: KEY, ContentType: "video/mp4" }));
    if (!created.UploadId) throw new Error("MULTIPART_UPLOAD_ID_MISSING");
    return NextResponse.json({ uploadId: created.UploadId });
  }
  const uploadId = request.headers.get("x-upload-id");
  if (!uploadId) return NextResponse.json({ error: "Upload IDが必要です" }, { status: 400 });
  if (action === "part") {
    const partNumber = Number(request.headers.get("x-part-number")); const bytes = new Uint8Array(await request.arrayBuffer());
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 20 || !bytes.length || bytes.length > 3 * 1024 * 1024) return NextResponse.json({ error: "Upload Partが不正です" }, { status: 400 });
    const result = await client.send(new UploadPartCommand({ Bucket: bucket, Key: KEY, UploadId: uploadId, PartNumber: partNumber, Body: bytes }));
    return NextResponse.json({ partNumber, eTag: result.ETag });
  }
  if (action === "abort") { await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: KEY, UploadId: uploadId })); return NextResponse.json({ aborted: true }); }
  if (action !== "complete") return NextResponse.json({ error: "Upload操作が不正です" }, { status: 400 });
  const body = await request.json() as { parts?: Array<{ partNumber: number; eTag: string }> };
  if (!body.parts?.length) return NextResponse.json({ error: "Upload Partsが必要です" }, { status: 400 });
  await client.send(new CompleteMultipartUploadCommand({ Bucket: bucket, Key: KEY, UploadId: uploadId, MultipartUpload: { Parts: body.parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.eTag })) } }));
  const [render] = await getDb().select({ id: finalRenders.id, outputObjectKey: finalRenders.outputObjectKey }).from(finalRenders).where(eq(finalRenders.id, RENDER_ID)).limit(1);
  if (!render?.outputObjectKey || render.outputObjectKey !== KEY) return NextResponse.json({ error: "対象Final Renderが見つかりません" }, { status: 404 });
  await getDb().update(finalRenders).set({ durationMs: 65160, updatedAt: new Date() }).where(eq(finalRenders.id, RENDER_ID));
  return NextResponse.json({ repaired: true });
}
