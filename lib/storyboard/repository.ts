import "server-only";
import { and, desc, eq, max, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { apiUsage, projects, scenes, storyboards } from "@/lib/db/schema";
import { estimateOpenAiCost } from "@/lib/storyboard/cost";
import type { StoryboardDirectorResult } from "@/lib/storyboard/director";
import type { StoryboardOutput } from "@/lib/storyboard/schema";

export type PersistStoryboardInput = {
  projectId: string;
  storyboard: StoryboardOutput;
  usage: StoryboardDirectorResult["usage"];
};

export type RecordStoryboardUsageInput = {
  projectId: string;
  operation: "storyboard_generation_failed";
  usage: StoryboardDirectorResult["usage"];
};

export interface StoryboardPersistence {
  replace(input: PersistStoryboardInput): Promise<{ storyboardId: string; version: number }>;
  recordUsage(input: RecordStoryboardUsageInput): Promise<void>;
}

export class DrizzleStoryboardPersistence implements StoryboardPersistence {
  async recordUsage(input: RecordStoryboardUsageInput) {
    await getDb()
      .insert(apiUsage)
      .values({
        projectId: input.projectId,
        provider: "openai",
        operation: input.operation,
        model: input.usage.model,
        inputTokens: input.usage.inputTokens,
        cachedInputTokens: input.usage.cachedInputTokens,
        outputTokens: input.usage.outputTokens,
        requestId: input.usage.requestId,
        durationMs: input.usage.durationMs,
        estimatedCost: estimateOpenAiCost(input.usage),
      });
  }

  async replace(input: PersistStoryboardInput) {
    const db = getDb();
    return db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${input.projectId}))`);
      const [latest] = await transaction
        .select({ version: max(storyboards.version) })
        .from(storyboards)
        .where(eq(storyboards.projectId, input.projectId));
      const version = (latest.version ?? 0) + 1;
      await transaction
        .update(storyboards)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(storyboards.projectId, input.projectId), eq(storyboards.isActive, true)));
      const [storyboard] = await transaction
        .insert(storyboards)
        .values({
          projectId: input.projectId,
          version,
          isActive: true,
          totalDuration: input.storyboard.scenes.reduce((sum, scene) => sum + scene.duration, 0),
        })
        .returning({ id: storyboards.id });
      await transaction.insert(scenes).values(
        input.storyboard.scenes.map(({ sceneNumber, ...scene }) => ({
          ...scene,
          order: sceneNumber,
          projectId: input.projectId,
          storyboardId: storyboard.id,
        })),
      );
      await transaction.insert(apiUsage).values({
        projectId: input.projectId,
        provider: "openai",
        operation: "storyboard_generation",
        model: input.usage.model,
        inputTokens: input.usage.inputTokens,
        cachedInputTokens: input.usage.cachedInputTokens,
        outputTokens: input.usage.outputTokens,
        requestId: input.usage.requestId,
        durationMs: input.usage.durationMs,
        estimatedCost: estimateOpenAiCost(input.usage),
      });
      await transaction
        .update(projects)
        .set({ status: "storyboard", updatedAt: new Date() })
        .where(eq(projects.id, input.projectId));
      return { storyboardId: storyboard.id, version };
    });
  }
}

export async function getActiveStoryboard(projectId: string) {
  const db = getDb();
  const [storyboard] = await db
    .select()
    .from(storyboards)
    .where(and(eq(storyboards.projectId, projectId), eq(storyboards.isActive, true)))
    .orderBy(desc(storyboards.version))
    .limit(1);
  if (!storyboard) return null;
  const storyboardScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.storyboardId, storyboard.id))
    .orderBy(scenes.order);
  return { storyboard, scenes: storyboardScenes };
}
