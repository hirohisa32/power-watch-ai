import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assets, projects } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { isProductPhotoRole } from "@/lib/storyboard/product-photo-planner";
import { assertSameOrigin } from "@/lib/security";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id, assetId } = await params;
    const db = getDb();
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
      .limit(1);
    if (!project)
      return NextResponse.json({ error: "プロジェクトが見つかりません" }, { status: 404 });
    const [asset] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.projectId, id)))
      .limit(1);
    if (!asset || !isProductPhotoRole(asset.detectedRole))
      return NextResponse.json({ error: "採用できるAI判定がありません" }, { status: 400 });
    await db
      .update(assets)
      .set({ role: asset.detectedRole, humanLocked: true })
      .where(eq(assets.id, asset.id));
    return NextResponse.json({ id: asset.id, role: asset.detectedRole, humanLocked: true });
  } catch (error) {
    return apiError(error, "AI判定を採用できませんでした");
  }
}
