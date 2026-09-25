import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assets, projects } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { hasValidImageSignature, type WatchMimeType } from "@/lib/images";
import { assertSameOrigin } from "@/lib/security";
import { deletePrivateObject, uploadPrivateObject } from "@/lib/storage";
import { assetLabelSchema, watchImageSchema } from "@/lib/validation";

const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let uploadedKey: string | undefined;
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id } = await params;
    const db = getDb();
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
      .limit(1);
    if (!project)
      return NextResponse.json({ error: "プロジェクトが見つかりません" }, { status: 404 });
    const [assetCount] = await db
      .select({ value: count() })
      .from(assets)
      .where(eq(assets.projectId, id));
    if (assetCount.value >= 10)
      return NextResponse.json({ error: "時計画像は最大10枚までです" }, { status: 400 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return NextResponse.json({ error: "画像を選択してください" }, { status: 400 });
    const fileInfo = watchImageSchema.parse({ type: file.type, size: file.size });
    const label = assetLabelSchema.parse(form.get("label"));
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasValidImageSignature(bytes, fileInfo.type as WatchMimeType))
      return NextResponse.json(
        { error: "画像ファイルの内容を確認できませんでした" },
        { status: 400 },
      );
    uploadedKey = `projects/${id}/source/${randomUUID()}.${extension[fileInfo.type]}`;
    await uploadPrivateObject(uploadedKey, bytes, file.type);
    const [asset] = await db
      .insert(assets)
      .values({
        projectId: id,
        type: "watch_image",
        label,
        objectKey: uploadedKey,
        mimeType: file.type,
        sizeBytes: file.size,
      })
      .returning({ id: assets.id });
    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    if (uploadedKey) await deletePrivateObject(uploadedKey).catch(() => undefined);
    return apiError(
      error,
      error instanceof Error && error.message === "R2_NOT_CONFIGURED"
        ? "画像ストレージが設定されていません"
        : "画像をアップロードできませんでした",
    );
  }
}
