import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assets, projects } from "@/lib/db/schema";

export async function listUserProjects(userId: string, limit?: number) {
  const query = getDb().select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.updatedAt));
  const rows = limit ? await query.limit(limit) : await query;
  if (!rows.length) return [];
  const images = await getDb().select({ id: assets.id, projectId: assets.projectId }).from(assets).where(inArray(assets.projectId, rows.map((row) => row.id))).orderBy(assets.createdAt);
  const firstImage = new Map<string, string>();
  images.forEach((image) => { if (!firstImage.has(image.projectId)) firstImage.set(image.projectId, image.id); });
  return rows.map((row) => ({ ...row, thumbnailAssetId: firstImage.get(row.id) ?? null }));
}
