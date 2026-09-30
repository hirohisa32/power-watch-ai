import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assets, projects, scenes, videoGenerations } from "@/lib/db/schema";
import { GOLD_KHANJAR_ASSETS, GOLD_KHANJAR_STATIC_FILES, GOLD_KHANJAR_TITLE } from "@/lib/demo/gold-khanjar";
import { apiError } from "@/lib/http";
import { hasValidImageSignature } from "@/lib/images";
import { assertSameOrigin } from "@/lib/security";
import { deletePrivateObject, uploadPrivateObject } from "@/lib/storage";
import { isAdminEmail } from "@/lib/ui/presentation";

export async function POST(request: Request) {
  let uploadedKey: string | undefined;
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    if (!isAdminEmail(user.email)) return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    const form = await request.formData();
    const projectId = String(form.get("projectId") ?? "");
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "ファイルが必要です" }, { status: 400 });
    const db = getDb();
    const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.title, GOLD_KHANJAR_TITLE))).limit(1);
    if (!project) return NextResponse.json({ error: "Gold Khanjarプロジェクトが見つかりません" }, { status: 404 });
    const label = GOLD_KHANJAR_ASSETS[file.name];
    if (label) {
      if (file.type !== "image/jpeg" || file.size > 12 * 1024 * 1024) return NextResponse.json({ error: "JPEG画像を確認してください" }, { status: 400 });
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!hasValidImageSignature(bytes, "image/jpeg")) return NextResponse.json({ error: "JPEG内容を確認できません" }, { status: 400 });
      const [existing] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, projectId), eq(assets.label, label))).limit(1);
      if (existing) return NextResponse.json({ name: file.name, existing: true });
      uploadedKey = `projects/${projectId}/source/${file.name}`;
      await uploadPrivateObject(uploadedKey, bytes, "image/jpeg");
      await db.insert(assets).values({ projectId, type: "watch_image", label, objectKey: uploadedKey, mimeType: "image/jpeg", sizeBytes: file.size });
      return NextResponse.json({ name: file.name, uploaded: true });
    }
    if (!GOLD_KHANJAR_STATIC_FILES.includes(file.name)) return NextResponse.json({ error: "承認済みDemo素材ではありません" }, { status: 400 });
    if (file.type !== "video/mp4" || file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "MP4を確認してください" }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(4, 12)).includes("ftyp") === false) return NextResponse.json({ error: "MP4内容を確認できません" }, { status: 400 });
    const order = Number(file.name.match(/scene-(\d+)\.mp4/)?.[1]);
    const [scene] = await db.select().from(scenes).where(and(eq(scenes.projectId, projectId), eq(scenes.order, order))).limit(1);
    if (!scene) return NextResponse.json({ error: "対象Sceneが見つかりません" }, { status: 404 });
    if (scene.selectedGenerationId) return NextResponse.json({ name: file.name, existing: true });
    const generationId = randomUUID();
    uploadedKey = `projects/${projectId}/scenes/${scene.id}/generations/${generationId}.mp4`;
    await uploadPrivateObject(uploadedKey, bytes, "video/mp4");
    await db.transaction(async (tx) => {
      await tx.insert(videoGenerations).values({
        id: generationId,
        projectId,
        sceneId: scene.id,
        version: 1,
        provider: "internal",
        model: "photo-motion-v1",
        status: "completed",
        prompt: scene.visualPrompt,
        requestedDuration: 3,
        outputObjectKey: uploadedKey,
        estimatedCostCredits: 0,
        estimatedCostUsd: 0,
        actualCostCredits: 0,
        actualCostUsd: 0,
        completedAt: new Date(),
      });
      await tx.update(scenes).set({ selectedGenerationId: generationId, updatedAt: new Date() }).where(eq(scenes.id, scene.id));
    });
    return NextResponse.json({ name: file.name, uploaded: true });
  } catch (error) {
    if (uploadedKey) await deletePrivateObject(uploadedKey).catch(() => undefined);
    return apiError(error, "Gold Khanjar素材を登録できませんでした");
  }
}
