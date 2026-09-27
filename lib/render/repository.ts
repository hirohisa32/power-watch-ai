import "server-only";
import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  finalRenders,
  projects,
  renderJobs,
  scenes,
  storyboards,
  videoGenerations,
} from "@/lib/db/schema";
import { buildFinalRenderInput } from "./plan";

export class RenderRequestError extends Error {
  name = "RenderRequestError";
}

export async function createFinalRenderJob(input: { projectId: string; userId: string }) {
  const db = getDb();
  return db.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${input.projectId}))`);
    const [project] = await transaction
      .select()
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.userId, input.userId)))
      .limit(1);
    if (!project) throw new RenderRequestError("プロジェクトが見つかりません");
    const [storyboard] = await transaction
      .select()
      .from(storyboards)
      .where(and(eq(storyboards.projectId, input.projectId), eq(storyboards.isActive, true)))
      .limit(1);
    if (!storyboard) throw new RenderRequestError("Storyboardが見つかりません");
    const active = await transaction
      .select({ id: finalRenders.id })
      .from(finalRenders)
      .where(
        and(
          eq(finalRenders.projectId, input.projectId),
          inArray(finalRenders.status, ["queued", "rendering"]),
        ),
      )
      .limit(1);
    if (active.length) throw new RenderRequestError("完成動画はレンダリング中です");
    const rows = await transaction
      .select({
        scene: scenes,
        generationId: videoGenerations.id,
        generationStatus: videoGenerations.status,
        outputObjectKey: videoGenerations.outputObjectKey,
      })
      .from(scenes)
      .leftJoin(videoGenerations, eq(videoGenerations.id, scenes.selectedGenerationId))
      .where(eq(scenes.storyboardId, storyboard.id))
      .orderBy(scenes.order);
    const renderable = rows
      .filter(
        (row) => row.generationId && row.generationStatus === "completed" && row.outputObjectKey,
      )
      .map((row) => ({
        sceneId: row.scene.id,
        generationId: row.generationId!,
        order: row.scene.order,
        preset: row.scene.preset,
        duration: row.scene.duration,
        narration: row.scene.narration,
        subtitle: row.scene.subtitle,
        year: row.scene.year,
        location: row.scene.location,
        objectKey: row.outputObjectKey!,
      }));
    let renderInput;
    try {
      renderInput = buildFinalRenderInput({
        language: project.language,
        bgmKey: project.bgmKey,
        scenes: renderable,
        totalSceneCount: rows.length,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "MISSING_SCENE_VIDEO")
        throw new RenderRequestError("選択済みのScene動画がありません");
      throw error;
    }
    const [latest] = await transaction
      .select({ version: max(finalRenders.version) })
      .from(finalRenders)
      .where(eq(finalRenders.projectId, input.projectId));
    const [render] = await transaction
      .insert(finalRenders)
      .values({
        projectId: input.projectId,
        storyboardId: storyboard.id,
        version: (latest.version ?? 0) + 1,
        bgmKey: project.bgmKey,
        renderInput,
      })
      .returning();
    const [job] = await transaction
      .insert(renderJobs)
      .values({ projectId: input.projectId, renderId: render.id })
      .returning();
    return { render, job };
  });
}

export async function listProjectRenders(projectId: string) {
  return getDb()
    .select()
    .from(finalRenders)
    .where(eq(finalRenders.projectId, projectId))
    .orderBy(desc(finalRenders.createdAt));
}

export async function markRenderEnqueueFailed(jobId: string, message: string) {
  const db = getDb();
  const [job] = await db
    .update(renderJobs)
    .set({
      status: "failed",
      errorCode: "QUEUE_SEND_FAILED",
      errorMessage: message,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(renderJobs.id, jobId))
    .returning({ renderId: renderJobs.renderId });
  if (job)
    await db
      .update(finalRenders)
      .set({
        status: "failed",
        errorCode: "QUEUE_SEND_FAILED",
        errorMessage: "Final Renderを開始できませんでした",
        updatedAt: new Date(),
      })
      .where(eq(finalRenders.id, job.renderId));
}
