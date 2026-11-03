import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assets, projects } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { isProductPhotoRole } from "@/lib/storyboard/product-photo-planner";
import { assertSameOrigin } from "@/lib/security";
import { z } from "zod";

const inputSchema = z.object({ role: z.string().min(1).max(80) });

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
    const input = inputSchema.parse(await request.json());
    const [asset] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.projectId, id)))
      .limit(1);
    if (!asset || !isProductPhotoRole(input.role))
      return NextResponse.json({ error: "固定できるRoleではありません" }, { status: 400 });
    await db
      .update(assets)
      .set({
        role: input.role,
        humanLocked: true,
        analysis: {
          ...asset.analysis,
          humanRoleDecision: {
            role: input.role,
            source: input.role === asset.detectedRole ? "ai_suggestion" : "manual_selection",
            decidedAt: new Date().toISOString(),
          },
        },
      })
      .where(eq(assets.id, asset.id));
    return NextResponse.json({ id: asset.id, role: input.role, humanLocked: true });
  } catch (error) {
    return apiError(error, "AI判定を採用できませんでした");
  }
}
