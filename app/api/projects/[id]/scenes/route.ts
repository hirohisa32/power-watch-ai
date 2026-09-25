import { and, eq, max, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assets, projects, scenes, storyboards } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { editableSceneSchema, validateSceneAssetLabels } from "@/lib/storyboard/schema";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id } = await params;
    const db = getDb();
    const [storyboard] = await db
      .select({ id: storyboards.id })
      .from(storyboards)
      .innerJoin(projects, eq(projects.id, storyboards.projectId))
      .where(
        and(
          eq(storyboards.projectId, id),
          eq(storyboards.isActive, true),
          eq(projects.userId, user.id),
        ),
      )
      .limit(1);
    if (!storyboard)
      return NextResponse.json({ error: "Storyboardが見つかりません" }, { status: 404 });
    const input = editableSceneSchema.parse(await request.json());
    const labels = await db
      .select({ label: assets.label })
      .from(assets)
      .where(eq(assets.projectId, id));
    validateSceneAssetLabels(
      input,
      labels.map((asset) => asset.label),
    );
    const [last] = await db
      .select({ order: max(scenes.order) })
      .from(scenes)
      .where(eq(scenes.storyboardId, storyboard.id));
    const [scene] = await db.transaction(async (transaction) => {
      const inserted = await transaction
        .insert(scenes)
        .values({
          ...input,
          order: (last.order ?? 0) + 1,
          projectId: id,
          storyboardId: storyboard.id,
        })
        .returning();
      await transaction
        .update(storyboards)
        .set({
          totalDuration: sql`${storyboards.totalDuration} + ${input.duration}`,
          updatedAt: new Date(),
        })
        .where(eq(storyboards.id, storyboard.id));
      return inserted;
    });
    return NextResponse.json(scene, { status: 201 });
  } catch (error) {
    return apiError(error, "Sceneを追加できませんでした");
  }
}
