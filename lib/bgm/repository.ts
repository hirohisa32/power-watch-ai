import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bgmAssets } from "@/lib/db/schema";
import { selectBgm } from "./selection";
import type { BgmSelectionInput } from "./types";

export async function listActiveBgm() {
  return getDb().select().from(bgmAssets).where(eq(bgmAssets.active, true)).orderBy(asc(bgmAssets.name));
}

export async function chooseApprovedBgm(input: BgmSelectionInput) {
  const catalog = await listActiveBgm();
  return selectBgm(catalog, input);
}
