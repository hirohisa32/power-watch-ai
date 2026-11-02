import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { detectWatchPhotoRole } from "@/lib/assets/role-detection";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assets, projects } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { readPrivateObject } from "@/lib/storage";

export const maxDuration = 300;

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
    const productAssets = await db
      .select()
      .from(assets)
      .where(and(eq(assets.projectId, id), eq(assets.type, "watch_image")));

    const results = [];
    for (const asset of productAssets) {
      const detection = await detectWatchPhotoRole({
        bytes: await readPrivateObject(asset.objectKey),
        mimeType: asset.mimeType,
      });
      await db
        .update(assets)
        .set({
          humanLabel: asset.humanLabel ?? asset.label,
          detectedRole: detection.role,
          detectionConfidence: detection.confidence,
          analysis: {
            ...asset.analysis,
            roleDetection: detection,
          },
        })
        .where(eq(assets.id, asset.id));
      results.push({ id: asset.id, humanLabel: asset.humanLabel ?? asset.label, ...detection });
    }
    return NextResponse.json({ count: results.length, assets: results });
  } catch (error) {
    return apiError(error, "商品写真を解析できませんでした");
  }
}
