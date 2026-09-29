import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assets, projects, scenes, storyboards } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { copyPrivateObject, deletePrivateObject } from "@/lib/storage";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id } = await params;
    const db = getDb();
    const [source] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
      .limit(1);
    if (!source)
      return NextResponse.json({ error: "プロジェクトが見つかりません" }, { status: 404 });
    const [copy] = await db
      .insert(projects)
      .values({
        userId: user.id,
        title: `${source.title}（コピー）`,
        script: source.script,
        style: source.style,
        language: source.language,
        targetDuration: source.targetDuration,
      })
      .returning({ id: projects.id });
    const copiedKeys: string[] = [];
    try {
      const sourceAssets = await db.select().from(assets).where(eq(assets.projectId, id));
      for (const asset of sourceAssets) {
        const extension = asset.objectKey.split(".").pop() ?? "bin";
        const objectKey = `projects/${copy.id}/source/${randomUUID()}.${extension}`;
        await copyPrivateObject(asset.objectKey, objectKey);
        copiedKeys.push(objectKey);
        await db.insert(assets).values({ projectId: copy.id, type: asset.type, label: asset.label, objectKey, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes });
      }
      const [sourceStoryboard] = await db.select().from(storyboards).where(and(eq(storyboards.projectId, id), eq(storyboards.isActive, true))).limit(1);
      if (sourceStoryboard) {
        const [newStoryboard] = await db.insert(storyboards).values({ projectId: copy.id, version: 1, isActive: true, totalDuration: sourceStoryboard.totalDuration }).returning({ id: storyboards.id });
        const sourceScenes = await db.select().from(scenes).where(eq(scenes.storyboardId, sourceStoryboard.id));
        if (sourceScenes.length) await db.insert(scenes).values(sourceScenes.map(({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, selectedGenerationId: _selected, ...scene }) => {
          void _id; void _createdAt; void _updatedAt; void _selected;
          return { ...scene, projectId: copy.id, storyboardId: newStoryboard.id };
        }));
        await db.update(projects).set({ status: "storyboard", updatedAt: new Date() }).where(eq(projects.id, copy.id));
      }
    } catch (error) {
      await Promise.allSettled(copiedKeys.map((key) => deletePrivateObject(key)));
      await db.delete(projects).where(eq(projects.id, copy.id));
      throw error;
    }
    return NextResponse.json(copy, { status: 201 });
  } catch (error) {
    return apiError(error, "動画を複製できませんでした");
  }
}
