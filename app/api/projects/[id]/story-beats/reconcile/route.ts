import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assets, projects, scenes, storyboards, videoGenerations } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import {
  inferProductPhotoRole,
  planProductPhotoUsage,
} from "@/lib/storyboard/product-photo-planner";
import { evaluateVisualRelevance } from "@/lib/storyboard/visual-relevance";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const [storyboard] = await db
      .select({ id: storyboards.id })
      .from(storyboards)
      .where(and(eq(storyboards.projectId, id), eq(storyboards.isActive, true)))
      .limit(1);
    if (!storyboard)
      return NextResponse.json({ error: "Storyboardが見つかりません" }, { status: 404 });

    const [storyScenes, productAssets] = await Promise.all([
      db.select().from(scenes).where(eq(scenes.storyboardId, storyboard.id)).orderBy(scenes.order),
      db.select().from(assets).where(eq(assets.projectId, id)).orderBy(assets.createdAt),
    ]);
    const assetByLabel = new Map(productAssets.map((asset) => [asset.label, asset]));
    const plans = planProductPhotoUsage(
      storyScenes.map((scene) => ({
        ...scene,
        visualIntent: scene.visualIntent ?? scene.visualDescription,
        visualSubject: scene.visualSubject ?? scene.title,
      })),
      productAssets.map((asset) => asset.label),
    );
    const generationIds = storyScenes
      .map((scene) => scene.selectedGenerationId)
      .filter((value): value is string => Boolean(value));
    const selectedGenerations = generationIds.length
      ? await db.select().from(videoGenerations).where(eq(videoGenerations.projectId, id))
      : [];
    const generationById = new Map(
      selectedGenerations.map((generation) => [generation.id, generation]),
    );
    const result: Array<Record<string, unknown>> = [];

    await db.transaction(async (transaction) => {
      for (const asset of productAssets) {
        const role = asset.role ?? inferProductPhotoRole(asset.label);
        await transaction
          .update(assets)
          .set({
            role,
            analysis: { ...asset.analysis, inferredRole: role, source: "label-semantic-v1" },
          })
          .where(eq(assets.id, asset.id));
      }
      for (const [index, scene] of storyScenes.entries()) {
        const plan = plans[index];
        const selectedLabel = plan.preferredAssetLabels[0] ?? null;
        const productAsset = selectedLabel ? assetByLabel.get(selectedLabel) : null;
        const visualIntent = scene.visualIntent ?? scene.visualDescription;
        const visualSubject = scene.visualSubject ?? scene.title;
        const visualType = scene.visualType ?? (scene.watchReference ? "product_photo" : "story");
        const relevance = evaluateVisualRelevance({
          narration: scene.narration,
          visualIntent,
          visualSubject,
          historicalPeriod: scene.historicalPeriod ?? scene.year,
          year: scene.year,
          location: scene.location,
          characterId: scene.characterId,
          watchReference: scene.watchReference,
          productPhotoRole: plan.productPhotoRole,
          visualType,
        });
        const selectedGeneration = scene.selectedGenerationId
          ? generationById.get(scene.selectedGenerationId)
          : null;
        const staleProductGeneration = Boolean(
          scene.watchReference &&
          productAsset &&
          selectedGeneration &&
          !selectedGeneration.referenceAssetIds.includes(productAsset.id),
        );
        await transaction
          .update(scenes)
          .set({
            narrationSegmentId:
              scene.narrationSegmentId ?? `segment-${String(scene.order).padStart(2, "0")}`,
            visualIntent,
            visualSubject,
            historicalPeriod: scene.historicalPeriod ?? scene.year,
            visualType,
            productPhotoRole: plan.productPhotoRole,
            productPhotoId: productAsset?.id ?? null,
            preferredAssetLabels: plan.preferredAssetLabels,
            visualRelevanceScore: relevance.score,
            visualRelevanceStatus: relevance.status,
            selectedGenerationId: staleProductGeneration ? null : scene.selectedGenerationId,
            updatedAt: new Date(),
          })
          .where(eq(scenes.id, scene.id));
        result.push({
          sceneId: scene.id,
          order: scene.order,
          title: scene.title,
          relevance,
          productPhoto: selectedLabel,
          productPhotoRole: plan.productPhotoRole,
          staleProductGeneration,
        });
      }
    });

    return NextResponse.json({
      scenes: result,
      pass: result.filter((item) => (item.relevance as { status: string }).status === "pass")
        .length,
      review: result.filter((item) => (item.relevance as { status: string }).status === "review")
        .length,
      ng: result.filter((item) => (item.relevance as { status: string }).status === "ng").length,
      staleProductSceneIds: result
        .filter((item) => item.staleProductGeneration)
        .map((item) => item.sceneId),
    });
  } catch (error) {
    return apiError(error, "Story Beatを再評価できませんでした");
  }
}
