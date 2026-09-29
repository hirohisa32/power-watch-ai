import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assets, projects } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { deletePrivateObject } from "@/lib/storage";
import { z } from "zod";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id } = await params;
    const input = z.object({ title: z.string().trim().min(1).max(120) }).parse(await request.json());
    const [project] = await getDb()
      .update(projects)
      .set({ title: input.title, updatedAt: new Date() })
      .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
      .returning({ id: projects.id, title: projects.title });
    if (!project) return NextResponse.json({ error: "動画が見つかりません" }, { status: 404 });
    return NextResponse.json(project);
  } catch (error) {
    return apiError(error, "動画名を変更できませんでした");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const objects = await db
      .select({ key: assets.objectKey })
      .from(assets)
      .where(eq(assets.projectId, id));
    const cleanup = await Promise.allSettled(
      objects.map((object) => deletePrivateObject(object.key)),
    );
    if (cleanup.some((result) => result.status === "rejected"))
      return NextResponse.json(
        { error: "画像の削除に失敗しました。安全のためプロジェクトは保持されています" },
        { status: 502 },
      );
    await db.delete(projects).where(eq(projects.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "プロジェクトを削除できませんでした");
  }
}
