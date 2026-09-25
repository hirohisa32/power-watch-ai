import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { projects, scenes, storyboards } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";

const moveSchema = z.object({ direction: z.enum(["up", "down"]) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sceneId: string }> },
) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id, sceneId } = await params;
    const { direction } = moveSchema.parse(await request.json());
    const db = getDb();
    const [current] = await db
      .select({ id: scenes.id, order: scenes.order, storyboardId: scenes.storyboardId })
      .from(scenes)
      .innerJoin(storyboards, eq(storyboards.id, scenes.storyboardId))
      .innerJoin(projects, eq(projects.id, scenes.projectId))
      .where(
        and(
          eq(scenes.id, sceneId),
          eq(scenes.projectId, id),
          eq(storyboards.isActive, true),
          eq(projects.userId, user.id),
        ),
      )
      .limit(1);
    if (!current) return NextResponse.json({ error: "Sceneが見つかりません" }, { status: 404 });
    const targetOrder = current.order + (direction === "up" ? -1 : 1);
    const [target] = await db
      .select({ id: scenes.id })
      .from(scenes)
      .where(and(eq(scenes.storyboardId, current.storyboardId), eq(scenes.order, targetOrder)))
      .limit(1);
    if (!target) return NextResponse.json({ ok: true });
    await db.transaction(async (transaction) => {
      await transaction.update(scenes).set({ order: 0 }).where(eq(scenes.id, current.id));
      await transaction
        .update(scenes)
        .set({ order: current.order })
        .where(eq(scenes.id, target.id));
      await transaction.update(scenes).set({ order: targetOrder }).where(eq(scenes.id, current.id));
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "Sceneを移動できませんでした");
  }
}
