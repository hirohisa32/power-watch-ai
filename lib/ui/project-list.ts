import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  assets,
  finalRenders,
  projects,
  scenes,
  storyboards,
  videoGenerations,
} from "@/lib/db/schema";
import { getProjectWorkflowStatus } from "@/lib/ui/project-workflow";

export async function listUserProjects(userId: string, limit?: number) {
  const db = getDb();
  const query = db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.updatedAt));
  const rows = limit ? await query.limit(limit) : await query;
  if (!rows.length) return [];
  const projectIds = rows.map((row) => row.id);
  const [images, activeStoryboards, generations, renders] = await Promise.all([
    db
      .select({ id: assets.id, projectId: assets.projectId })
      .from(assets)
      .where(inArray(assets.projectId, projectIds))
      .orderBy(assets.createdAt),
    db
      .select({ id: storyboards.id, projectId: storyboards.projectId })
      .from(storyboards)
      .where(and(inArray(storyboards.projectId, projectIds), eq(storyboards.isActive, true))),
    db
      .select({
        id: videoGenerations.id,
        projectId: videoGenerations.projectId,
        sceneId: videoGenerations.sceneId,
        status: videoGenerations.status,
      })
      .from(videoGenerations)
      .where(inArray(videoGenerations.projectId, projectIds)),
    db
      .select({ projectId: finalRenders.projectId, status: finalRenders.status })
      .from(finalRenders)
      .where(inArray(finalRenders.projectId, projectIds)),
  ]);
  const storyboardIds = activeStoryboards.map((storyboard) => storyboard.id);
  const projectScenes = storyboardIds.length
    ? await db
        .select({
          id: scenes.id,
          projectId: scenes.projectId,
          preset: scenes.preset,
          selectedGenerationId: scenes.selectedGenerationId,
        })
        .from(scenes)
        .where(inArray(scenes.storyboardId, storyboardIds))
    : [];
  const firstImage = new Map<string, string>();
  images.forEach((image) => {
    if (!firstImage.has(image.projectId)) firstImage.set(image.projectId, image.id);
  });
  const activeStoryboardProjectIds = new Set(
    activeStoryboards.map((storyboard) => storyboard.projectId),
  );
  return rows.map((row) => ({
    ...row,
    thumbnailAssetId: firstImage.get(row.id) ?? null,
    workflow: getProjectWorkflowStatus({
      hasStoryboard: activeStoryboardProjectIds.has(row.id),
      scenes: projectScenes.filter((scene) => scene.projectId === row.id),
      generations: generations.filter((generation) => generation.projectId === row.id),
      renders: renders.filter((render) => render.projectId === row.id),
    }),
  }));
}
