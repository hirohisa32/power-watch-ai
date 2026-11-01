import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  assets,
  audioRecords,
  finalRenders,
  projects,
  scenes,
  storyboards,
  systemVideoAssets,
  videoGenerations,
} from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import {
  desiredProductPhotoRole,
  inferProductPhotoRole,
  planProductPhotoUsage,
  shouldUseProductEvidence,
} from "@/lib/storyboard/product-photo-planner";
import { evaluateVisualRelevance } from "@/lib/storyboard/visual-relevance";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id } = await params;
    const db = getDb();
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
      .limit(1);
    if (!project)
      return NextResponse.json({ error: "プロジェクトが見つかりません" }, { status: 404 });
    const [storyboard] = await db
      .select()
      .from(storyboards)
      .where(and(eq(storyboards.projectId, id), eq(storyboards.isActive, true)))
      .limit(1);
    if (!storyboard)
      return NextResponse.json({ error: "Storyboardが見つかりません" }, { status: 404 });
    const [storyScenes, projectAssets, narration, render, ending] = await Promise.all([
      db.select().from(scenes).where(eq(scenes.storyboardId, storyboard.id)).orderBy(scenes.order),
      db.select().from(assets).where(eq(assets.projectId, id)),
      db
        .select()
        .from(audioRecords)
        .where(eq(audioRecords.projectId, id))
        .orderBy(desc(audioRecords.createdAt))
        .limit(1),
      db
        .select()
        .from(finalRenders)
        .where(eq(finalRenders.projectId, id))
        .orderBy(desc(finalRenders.createdAt))
        .limit(1),
      project.endingAssetId
        ? db
            .select()
            .from(systemVideoAssets)
            .where(eq(systemVideoAssets.id, project.endingAssetId))
            .limit(1)
        : Promise.resolve([]),
    ]);
    const labelById = new Map(projectAssets.map((asset) => [asset.id, asset.label]));
    const scores = storyScenes.map((scene) => scene.visualRelevanceScore ?? 0);
    return NextResponse.json({
      projectId: id,
      storyboardId: storyboard.id,
      counts: {
        pass: storyScenes.filter((scene) => scene.visualRelevanceStatus === "pass").length,
        review: storyScenes.filter((scene) => scene.visualRelevanceStatus === "review").length,
        ng: storyScenes.filter((scene) => scene.visualRelevanceStatus === "ng").length,
      },
      averageVisualRelevance: scores.length
        ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2))
        : 0,
      narration: narration[0]
        ? {
            durationMs: narration[0].durationMs,
            alignmentSource: narration[0].alignment?.source ?? "legacy_unaligned",
          }
        : null,
      ending: ending[0]
        ? {
            key: ending[0].key,
            originalDurationMs: ending[0].durationMs,
            recommendedStartMs: ending[0].recommendedStartMs,
            recommendedEndMs: ending[0].recommendedEndMs,
            recommendedDurationMs: ending[0].recommendedDurationMs,
          }
        : null,
      latestRender: render[0]
        ? {
            id: render[0].id,
            version: render[0].version,
            status: render[0].status,
            durationMs: render[0].durationMs,
            outputObjectKey: render[0].outputObjectKey,
          }
        : null,
      scenes: storyScenes.map((scene) => ({
        id: scene.id,
        order: scene.order,
        title: scene.title,
        duration: scene.duration,
        narrationSegmentId: scene.narrationSegmentId,
        visualIntent: scene.visualIntent,
        visualSubject: scene.visualSubject,
        visualType: scene.visualType,
        visualRelevanceScore: scene.visualRelevanceScore,
        visualRelevanceStatus: scene.visualRelevanceStatus,
        productPhoto: scene.productPhotoId ? labelById.get(scene.productPhotoId) ?? null : null,
        productPhotoRole: scene.productPhotoRole,
        selectedGenerationId: scene.selectedGenerationId,
      })),
    });
  } catch (error) {
    return apiError(error, "Story Beat監査結果を取得できませんでした");
  }
}

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
    const evidenceScenes = storyScenes.map((scene) => ({
      ...scene,
      watchReference:
        scene.watchReference ||
        shouldUseProductEvidence(
          `${scene.narration} ${scene.visualIntent ?? scene.visualDescription} ${scene.visualSubject ?? scene.title}`,
        ),
    }));
    const plans = planProductPhotoUsage(
      evidenceScenes.map((scene) => ({
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
        const useProductEvidence = evidenceScenes[index].watchReference;
        const plan = plans[index];
        const selectedLabel = plan.preferredAssetLabels[0] ?? null;
        const productAsset = selectedLabel ? assetByLabel.get(selectedLabel) : null;
        const desiredRole = desiredProductPhotoRole(
          `${scene.narration} ${scene.visualIntent ?? scene.visualDescription} ${scene.visualSubject ?? scene.title}`,
        );
        const promotedVisualIntent = useProductEvidence && !scene.watchReference
          ? `実物の商品写真だけを使用し、${desiredRole}の識別情報を保持したまま、ナレーションが述べる細部を静かなカメラモーションで提示する。`
          : null;
        const visualIntent = promotedVisualIntent ?? scene.visualIntent ?? scene.visualDescription;
        const visualSubject = scene.visualSubject ?? scene.title;
        const visualType = useProductEvidence
          ? "product_photo"
          : scene.visualType ?? "story";
        const relevance = evaluateVisualRelevance({
          narration: scene.narration,
          visualIntent,
          visualSubject,
          historicalPeriod: scene.historicalPeriod ?? scene.year,
          year: scene.year,
          location: scene.location,
          characterId: scene.characterId,
          watchReference: useProductEvidence,
          productPhotoRole: plan.productPhotoRole,
          visualType,
        });
        const selectedGeneration = scene.selectedGenerationId
          ? generationById.get(scene.selectedGenerationId)
          : null;
        const staleProductGeneration = Boolean(
          useProductEvidence &&
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
            visualDescription: promotedVisualIntent ?? scene.visualDescription,
            visualSubject,
            historicalPeriod: scene.historicalPeriod ?? scene.year,
            visualType,
            watchReference: useProductEvidence,
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
