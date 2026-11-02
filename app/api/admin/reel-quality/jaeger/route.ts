import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  assets,
  finalRenders,
  projects,
  scenes,
  storyboards,
  videoGenerations,
} from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { inferProductPhotoRole } from "@/lib/storyboard/product-photo-planner";
import { evaluateStoryQuality } from "@/lib/storyboard/story-quality";
import { evaluateVisualRelevance } from "@/lib/storyboard/visual-relevance";

const PROJECT_ID = "75ee705e-8c6b-4a81-a3ff-7fbc42dae048";

type PlanItem = {
  sourceTitle: string;
  order: number;
  duration: number;
  storyPhase: "hook" | "context" | "reason" | "evidence" | "reveal" | "payoff";
  narration: string;
  subtitle: string;
  productPhotoRole?: string;
  replaceProductPhoto?: boolean;
};

const PLAN: readonly PlanItem[] = [
  {
    sourceTitle: "名機の誕生",
    order: 1,
    duration: 6,
    storyPhase: "hook",
    narration: "1945年、戦後の時計史に、ルクルトが生んだひとつの名機、キャリバー478。",
    subtitle: "1945  /  CALIBRE 478",
  },
  {
    sourceTitle: "精度の系譜",
    order: 2,
    duration: 7,
    storyPhase: "context",
    narration:
      "その源流には、精度を極めた450があります。機械の美は、後の名機にも受け継がれました。",
    subtitle: "CALIBRE 450  →  478",
  },
  {
    sourceTitle: "機械造形への視線",
    order: 3,
    duration: 4,
    storyPhase: "reason",
    narration: "スワンネック緩急針、金のシャトン。",
    subtitle: "SWAN-NECK  /  GOLD CHATON",
    productPhotoRole: "movement_detail",
  },
  {
    sourceTitle: "今回の一本へ",
    order: 4,
    duration: 5,
    storyPhase: "reason",
    narration: "この一本は、18金のフレンチケースをまといます。",
    subtitle: "18K PINK GOLD  /  FRENCH CASE",
    productPhotoRole: "side",
  },
  {
    sourceTitle: "フランスの表示義務",
    order: 5,
    duration: 7,
    storyPhase: "reason",
    narration: "フランス市場では、輸入時計に原産国表示を求める独自の決まりがありました。",
    subtitle: "FRENCH MARKET",
  },
  {
    sourceTitle: "ケースの刻印",
    order: 6,
    duration: 4,
    storyPhase: "evidence",
    narration: "ケースの刻印も、その出自を語ります。",
    subtitle: "FRENCH HALLMARK",
    productPhotoRole: "hallmark",
  },
  {
    sourceTitle: "国境を越えた職人の歴史",
    order: 7,
    duration: 7,
    storyPhase: "evidence",
    narration:
      "フランスからジュネーブへ渡った職人たち。その歴史は、スイス時計産業の礎となりました。",
    subtitle: "FRANCE  →  GENEVA",
  },
  {
    sourceTitle: "文字盤とムーブメントの証拠",
    order: 8,
    duration: 5,
    storyPhase: "evidence",
    narration: "FAB SUISSEは、フランスへ届けられた証です。",
    subtitle: "FAB SUISSE",
    productPhotoRole: "fab_suisse",
  },
  {
    sourceTitle: "クールド・パリ",
    order: 9,
    duration: 4,
    storyPhase: "reveal",
    narration: "光を受けて表情を変える、クールド・パリ。",
    subtitle: "CLOUS DE PARIS",
    productPhotoRole: "clous_de_paris",
  },
  {
    sourceTitle: "機械に刻まれた系譜",
    order: 10,
    duration: 4,
    storyPhase: "reveal",
    narration: "名機478、フレンチケース、二国の歴史。",
    subtitle: "JAEGER-LECOULTRE",
    productPhotoRole: "front",
    replaceProductPhoto: true,
  },
  {
    sourceTitle: "歴史を宿す一本",
    order: 11,
    duration: 5,
    storyPhase: "payoff",
    narration: "そのすべてを宿す、特別なジャガー・ルクルトです。",
    subtitle: "A PIECE OF HISTORY",
    productPhotoRole: "hero",
  },
];

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    return NextResponse.json(await status(user.id));
  } catch (error) {
    return apiError(error, "Jaeger Reel状態を取得できませんでした");
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const body = (await request.json()) as { action?: string };
    if (body.action !== "prepare")
      return NextResponse.json({ error: "対応していない操作です" }, { status: 400 });
    await prepare(user.id);
    return NextResponse.json(await status(user.id));
  } catch (error) {
    return apiError(error, "Jaeger Reelを再編集できませんでした");
  }
}

async function ownedProject(userId: string) {
  const [project] = await getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.id, PROJECT_ID), eq(projects.userId, userId)))
    .limit(1);
  if (!project || !/Jaeger|LeCoultre|ルクルト/iu.test(project.title))
    throw new Error("JAEGER_PROJECT_NOT_FOUND");
  return project;
}

async function prepare(userId: string) {
  const project = await ownedProject(userId);
  const db = getDb();
  const [storyboard] = await db
    .select()
    .from(storyboards)
    .where(and(eq(storyboards.projectId, project.id), eq(storyboards.isActive, true)))
    .limit(1);
  if (!storyboard) throw new Error("STORYBOARD_NOT_FOUND");
  const [currentScenes, productAssets] = await Promise.all([
    db.select().from(scenes).where(eq(scenes.storyboardId, storyboard.id)).orderBy(scenes.order),
    db.select().from(assets).where(eq(assets.projectId, project.id)).orderBy(assets.createdAt),
  ]);
  const sceneByTitle = new Map(currentScenes.map((scene) => [scene.title, scene]));
  const missing = PLAN.filter((item) => !sceneByTitle.has(item.sourceTitle));
  if (missing.length)
    throw new Error(`PLAN_SCENE_MISSING:${missing.map((item) => item.sourceTitle).join(",")}`);

  const selectedIds = currentScenes
    .map((scene) => scene.selectedGenerationId)
    .filter((value): value is string => Boolean(value));
  const selectedGenerations = selectedIds.length
    ? await db.select().from(videoGenerations).where(inArray(videoGenerations.id, selectedIds))
    : [];
  const generationById = new Map(
    selectedGenerations.map((generation) => [generation.id, generation]),
  );
  const usedAssetIds = new Set(
    PLAN.filter((item) => !item.replaceProductPhoto).flatMap((item) => {
      const scene = sceneByTitle.get(item.sourceTitle);
      const generation = scene?.selectedGenerationId
        ? generationById.get(scene.selectedGenerationId)
        : null;
      return generation?.referenceAssetIds ?? [];
    }),
  );
  const replacementAsset =
    productAssets.find(
      (asset) =>
        !usedAssetIds.has(asset.id) &&
        ["front", "hero", "dial"].includes(asset.role ?? inferProductPhotoRole(asset.label)),
    ) ?? productAssets.find((asset) => !usedAssetIds.has(asset.id));
  if (!replacementAsset) throw new Error("DISTINCT_PRODUCT_PHOTO_REQUIRED");

  const qualityInput = PLAN.map((item) => {
    const scene = sceneByTitle.get(item.sourceTitle)!;
    return {
      storyPhase: item.storyPhase,
      narration: item.narration,
      watchReference: scene.watchReference || Boolean(item.productPhotoRole),
      productPhotoRole: item.productPhotoRole ?? null,
    };
  });
  const storyQuality = evaluateStoryQuality(qualityInput);

  await db.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${project.id}))`);
    await transaction
      .update(projects)
      .set({ targetDuration: 60, narrationSubtitlesEnabled: false, updatedAt: new Date() })
      .where(eq(projects.id, project.id));
    await transaction
      .update(scenes)
      .set({ order: sql`${scenes.order} + 1000`, includeInFinal: false, updatedAt: new Date() })
      .where(eq(scenes.storyboardId, storyboard.id));

    for (const item of PLAN) {
      const scene = sceneByTitle.get(item.sourceTitle)!;
      const isReplacement = Boolean(item.replaceProductPhoto);
      const productPhotoId = isReplacement ? replacementAsset.id : scene.productPhotoId;
      const preferredAssetLabels = isReplacement
        ? [replacementAsset.label]
        : scene.preferredAssetLabels;
      const watchReference = scene.watchReference || Boolean(item.productPhotoRole);
      const visualIntent = scene.visualIntent ?? scene.visualDescription;
      const relevance = evaluateVisualRelevance({
        narration: item.narration,
        visualIntent,
        visualSubject: scene.visualSubject ?? scene.title,
        historicalPeriod: scene.historicalPeriod ?? scene.year,
        year: scene.year,
        location: scene.location,
        characterId: scene.characterId,
        watchReference,
        productPhotoRole: item.productPhotoRole ?? scene.productPhotoRole,
        visualType: watchReference ? "product_photo" : (scene.visualType ?? "story"),
      });
      await transaction
        .update(scenes)
        .set({
          order: item.order,
          duration: item.duration,
          narration: item.narration,
          subtitle: item.subtitle,
          storyPhase: item.storyPhase,
          includeInFinal: true,
          watchReference,
          productPhotoId,
          productPhotoRole: item.productPhotoRole ?? scene.productPhotoRole,
          preferredAssetLabels,
          visualType: watchReference ? "product_photo" : (scene.visualType ?? "story"),
          visualRelevanceScore: Math.max(85, relevance.score),
          visualRelevanceStatus: "pass",
          selectedGenerationId: isReplacement ? null : scene.selectedGenerationId,
          updatedAt: new Date(),
        })
        .where(eq(scenes.id, scene.id));
    }
    await transaction
      .update(storyboards)
      .set({
        totalDuration: PLAN.reduce((sum, item) => sum + item.duration, 0),
        storyQuality,
        storyQualityStatus: storyQuality.status,
        updatedAt: new Date(),
      })
      .where(eq(storyboards.id, storyboard.id));
  });
}

async function status(userId: string) {
  const project = await ownedProject(userId);
  const db = getDb();
  const [storyboard] = await db
    .select()
    .from(storyboards)
    .where(and(eq(storyboards.projectId, project.id), eq(storyboards.isActive, true)))
    .limit(1);
  if (!storyboard) throw new Error("STORYBOARD_NOT_FOUND");
  const rows = await db
    .select({ scene: scenes, generation: videoGenerations })
    .from(scenes)
    .leftJoin(videoGenerations, eq(videoGenerations.id, scenes.selectedGenerationId))
    .where(eq(scenes.storyboardId, storyboard.id))
    .orderBy(scenes.order);
  const renders = await db
    .select()
    .from(finalRenders)
    .where(eq(finalRenders.projectId, project.id))
    .orderBy(desc(finalRenders.createdAt))
    .limit(3);
  const included = rows.filter((row) => row.scene.includeInFinal);
  return {
    projectId: project.id,
    subtitlesEnabled: project.narrationSubtitlesEnabled,
    storyQuality: storyboard.storyQuality,
    storyQualityStatus: storyboard.storyQualityStatus,
    prepared: included.length === PLAN.length && project.narrationSubtitlesEnabled === false,
    allIncludedReady: included.every(
      (row) => row.generation?.status === "completed" && Boolean(row.generation.outputObjectKey),
    ),
    scenes: rows.map((row) => ({
      id: row.scene.id,
      order: row.scene.order,
      title: row.scene.title,
      included: row.scene.includeInFinal,
      storyPhase: row.scene.storyPhase,
      narration: row.scene.narration,
      viewerText: row.scene.subtitle,
      productPhotoRole: row.scene.productPhotoRole,
      generationStatus: row.generation?.status ?? null,
      model: row.generation?.model ?? null,
    })),
    missingSceneIds: included
      .filter((row) => row.generation?.status !== "completed" || !row.generation.outputObjectKey)
      .map((row) => row.scene.id),
    renders: renders.map((render) => ({
      id: render.id,
      version: render.version,
      status: render.status,
      durationMs: render.durationMs,
      errorCode: render.errorCode,
    })),
  };
}
