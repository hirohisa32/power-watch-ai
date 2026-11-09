import { and, eq, gt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assets, projects, scenes, storyboards } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { editableSceneSchema, validateSceneAssetLabels } from "@/lib/storyboard/schema";
import { inferProductPhotoRole } from "@/lib/storyboard/product-photo-planner";
import { evaluateVisualRelevance } from "@/lib/storyboard/visual-relevance";

async function ownedScene(projectId: string, sceneId: string, userId: string) {
  const [row] = await getDb()
    .select({ scene: scenes, storyboardId: storyboards.id })
    .from(scenes)
    .innerJoin(storyboards, eq(storyboards.id, scenes.storyboardId))
    .innerJoin(projects, eq(projects.id, scenes.projectId))
    .where(
      and(
        eq(scenes.id, sceneId),
        eq(scenes.projectId, projectId),
        eq(storyboards.isActive, true),
        eq(projects.userId, userId),
      ),
    )
    .limit(1);
  return row;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; sceneId: string }> },
) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id, sceneId } = await params;
    const current = await ownedScene(id, sceneId, user.id);
    if (!current) return NextResponse.json({ error: "Sceneが見つかりません" }, { status: 404 });
    const input = editableSceneSchema.parse(await request.json());
    const db = getDb();
    const projectAssets = await db
      .select({ id: assets.id, label: assets.label })
      .from(assets)
      .where(eq(assets.projectId, id));
    validateSceneAssetLabels(
      input,
      projectAssets.map((asset) => asset.label),
    );
    const selectedAsset = input.preferredAssetLabels[0]
      ? projectAssets.find((asset) => asset.label === input.preferredAssetLabels[0])
      : null;
    const synchronized = {
      ...input,
      productPhotoId: input.watchReference ? (selectedAsset?.id ?? null) : null,
      productPhotoRole:
        input.watchReference && selectedAsset ? inferProductPhotoRole(selectedAsset.label) : null,
      visualType: input.watchReference ? "product_photo" : input.visualType,
      // The ordinary editor exposes one user-facing visual description. Keep the
      // machine-facing intent in sync instead of retaining stale planner copy.
      visualIntent: input.visualDescription,
      visualSubject:
        input.watchReference && selectedAsset
          ? `登録写真「${selectedAsset.label}」の実物時計`
          : input.visualSubject,
    };
    const relevance = evaluateVisualRelevance({
      narration: synchronized.narration,
      visualIntent: synchronized.visualIntent,
      visualSubject: synchronized.visualSubject ?? synchronized.title,
      historicalPeriod: synchronized.historicalPeriod,
      year: synchronized.year,
      location: synchronized.location,
      characterId: synchronized.characterId,
      watchReference: synchronized.watchReference,
      productPhotoRole: synchronized.productPhotoRole,
      visualType: synchronized.visualType ?? "story",
    });
    const [updated] = await db.transaction(async (transaction) => {
      const rows = await transaction
        .update(scenes)
        .set({
          ...synchronized,
          visualRelevanceScore: relevance.score,
          visualRelevanceStatus: relevance.status,
          updatedAt: new Date(),
        })
        .where(eq(scenes.id, sceneId))
        .returning();
      await transaction
        .update(storyboards)
        .set({
          totalDuration: sql`${storyboards.totalDuration} + ${synchronized.duration - current.scene.duration}`,
          updatedAt: new Date(),
        })
        .where(eq(storyboards.id, current.storyboardId));
      return rows;
    });
    return NextResponse.json(updated);
  } catch (error) {
    return apiError(error, "Sceneを保存できませんでした");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; sceneId: string }> },
) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id, sceneId } = await params;
    const current = await ownedScene(id, sceneId, user.id);
    if (!current) return NextResponse.json({ error: "Sceneが見つかりません" }, { status: 404 });
    const db = getDb();
    await db.transaction(async (transaction) => {
      await transaction.delete(scenes).where(eq(scenes.id, sceneId));
      await transaction
        .update(scenes)
        .set({ order: sql`${scenes.order} + 1000` })
        .where(
          and(eq(scenes.storyboardId, current.storyboardId), gt(scenes.order, current.scene.order)),
        );
      await transaction
        .update(scenes)
        .set({ order: sql`${scenes.order} - 1001` })
        .where(and(eq(scenes.storyboardId, current.storyboardId), gt(scenes.order, 1000)));
      await transaction
        .update(storyboards)
        .set({
          totalDuration: sql`${storyboards.totalDuration} - ${current.scene.duration}`,
          updatedAt: new Date(),
        })
        .where(eq(storyboards.id, current.storyboardId));
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "Sceneを削除できませんでした");
  }
}
