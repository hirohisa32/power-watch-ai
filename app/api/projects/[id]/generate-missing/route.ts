import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { projects, scenes, storyboards, videoGenerations } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { VercelVideoJobQueue } from "@/lib/video/queue";
import { createGenerationJob, markEnqueueFailed } from "@/lib/video/repository";
import { isFixedOpeningPreset } from "@/lib/opening/policy";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id } = await params;
    const db = getDb();
    const candidates = await db
      .select({ id: scenes.id, preset: scenes.preset })
      .from(scenes)
      .innerJoin(projects, eq(projects.id, scenes.projectId))
      .innerJoin(storyboards, eq(storyboards.id, scenes.storyboardId))
      .where(
        and(eq(scenes.projectId, id), eq(projects.userId, user.id), eq(storyboards.isActive, true)),
      );
    if (!candidates.length)
      return NextResponse.json({ error: "Storyboardが見つかりません" }, { status: 404 });
    const existing = await db
      .select({ sceneId: videoGenerations.sceneId, status: videoGenerations.status })
      .from(videoGenerations)
      .where(eq(videoGenerations.projectId, id));
    const blocked = new Set(
      existing
        .filter((item) => ["queued", "generating", "completed"].includes(item.status))
        .map((item) => item.sceneId),
    );
    const queue = new VercelVideoJobQueue();
    const queued: string[] = [];
    for (const scene of candidates.filter(
      (item) => !isFixedOpeningPreset(item.preset) && !blocked.has(item.id),
    )) {
      const created = await createGenerationJob({
        projectId: id,
        sceneId: scene.id,
        userId: user.id,
      });
      try {
        await queue.enqueue({ jobId: created.job.id, cycle: 0 });
        queued.push(created.generation.id);
      } catch (error) {
        await markEnqueueFailed(
          created.job.id,
          error instanceof Error ? error.message : "Queue send failed",
        );
      }
    }
    return NextResponse.json({ queued: queued.length, generationIds: queued }, { status: 202 });
  } catch (error) {
    return apiError(error, "未生成Sceneの一括生成を開始できませんでした");
  }
}
