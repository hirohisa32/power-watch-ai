import "server-only";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { japaneseReadingDictionary, narrationQualityRuns, narrationQualitySegments } from "@/lib/db/schema";
import type { JapaneseReadingEntry } from "./japanese-reading";

export async function loadJapaneseReadingDictionary(projectId?: string): Promise<JapaneseReadingEntry[]> {
  const rows = await getDb().select().from(japaneseReadingDictionary).where(
    and(
      eq(japaneseReadingDictionary.approved, true),
      projectId
        ? or(isNull(japaneseReadingDictionary.projectId), eq(japaneseReadingDictionary.projectId, projectId))
        : isNull(japaneseReadingDictionary.projectId),
    ),
  );
  const byDisplay = new Map<string, JapaneseReadingEntry>();
  for (const row of rows.filter((row) => row.projectId === null))
    byDisplay.set(row.display, { display: row.display, reading: row.reading, source: row.source === "system" ? "system" : "human" });
  for (const row of rows.filter((row) => row.projectId !== null))
    byDisplay.set(row.display, { display: row.display, reading: row.reading, source: "project" });
  return [...byDisplay.values()];
}

export async function latestNarrationQualityRuns(limit = 10) {
  return getDb().select().from(narrationQualityRuns).orderBy(desc(narrationQualityRuns.createdAt)).limit(limit);
}

export async function narrationQualitySegmentsForRuns(runIds: string[]) {
  if (runIds.length === 0) return [];
  return getDb().select().from(narrationQualitySegments).where(inArray(narrationQualitySegments.runId, runIds)).orderBy(narrationQualitySegments.segmentIndex);
}
