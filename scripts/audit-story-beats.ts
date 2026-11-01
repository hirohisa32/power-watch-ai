import { and, desc, eq, ilike } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  assets,
  audioRecords,
  finalRenders,
  projects,
  scenes,
  storyboards,
} from "../lib/db/schema";
import { evaluateVisualRelevance } from "../lib/storyboard/visual-relevance";
import { inferProductPhotoRole } from "../lib/storyboard/product-photo-planner";

async function main() {
  const search = process.argv.slice(2).join(" ").trim();
  if (!search) throw new Error("Project title search is required");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  const db = drizzle(client);
  const [project] = await db
    .select()
    .from(projects)
    .where(ilike(projects.title, `%${search}%`))
    .limit(1);
  if (!project) throw new Error("Project not found");
  const [storyboard] = await db
    .select()
    .from(storyboards)
    .where(and(eq(storyboards.projectId, project.id), eq(storyboards.isActive, true)))
    .limit(1);
  if (!storyboard) throw new Error("Active storyboard not found");
  const [projectScenes, projectAssets, narration, render] = await Promise.all([
    db.select().from(scenes).where(eq(scenes.storyboardId, storyboard.id)).orderBy(scenes.order),
    db.select().from(assets).where(eq(assets.projectId, project.id)).orderBy(assets.createdAt),
    db
      .select()
      .from(audioRecords)
      .where(eq(audioRecords.projectId, project.id))
      .orderBy(desc(audioRecords.createdAt))
      .limit(1),
    db
      .select()
      .from(finalRenders)
      .where(eq(finalRenders.projectId, project.id))
      .orderBy(desc(finalRenders.createdAt))
      .limit(1),
  ]);

  console.log(
    JSON.stringify(
      {
        project: {
          id: project.id,
          title: project.title,
          style: project.style,
          bgmKey: project.bgmKey,
          openingAssetId: project.openingAssetId,
          endingAssetId: project.endingAssetId,
        },
        storyboard: {
          id: storyboard.id,
          version: storyboard.version,
          totalDuration: storyboard.totalDuration,
        },
        narration: narration[0]
          ? {
              id: narration[0].id,
              durationMs: narration[0].durationMs,
              objectKey: narration[0].objectKey,
              alignmentSource: narration[0].alignment?.source ?? null,
            }
          : null,
        render: render[0]
          ? {
              id: render[0].id,
              version: render[0].version,
              status: render[0].status,
              durationMs: render[0].durationMs,
              outputObjectKey: render[0].outputObjectKey,
            }
          : null,
        assets: projectAssets.map((asset) => ({
          id: asset.id,
          label: asset.label,
          role: asset.role ?? inferProductPhotoRole(asset.label),
          objectKey: asset.objectKey,
        })),
        scenes: projectScenes.map((scene) => {
          const relevance = evaluateVisualRelevance({
            narration: scene.narration,
            visualIntent: scene.visualIntent ?? scene.visualDescription,
            visualSubject: scene.visualSubject ?? scene.title,
            historicalPeriod: scene.historicalPeriod ?? scene.year,
            year: scene.year,
            location: scene.location,
            characterId: scene.characterId,
            watchReference: scene.watchReference,
            productPhotoRole: scene.productPhotoRole,
            visualType: scene.visualType ?? (scene.watchReference ? "product_photo" : "story"),
          });
          return {
            id: scene.id,
            order: scene.order,
            title: scene.title,
            duration: scene.duration,
            narration: scene.narration,
            visualDescription: scene.visualDescription,
            watchReference: scene.watchReference,
            preferredAssetLabels: scene.preferredAssetLabels,
            selectedGenerationId: scene.selectedGenerationId,
            relevance,
          };
        }),
      },
      null,
      2,
    ),
  );
  await client.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
