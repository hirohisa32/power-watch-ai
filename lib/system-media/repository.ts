import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { systemVideoAssets } from "@/lib/db/schema";
import {
  DEFAULT_SYSTEM_VIDEO_ASSET_ID,
  type SystemVideoAssetKind,
} from "./config";

export async function listActiveSystemVideoAssets() {
  return getDb()
    .select()
    .from(systemVideoAssets)
    .where(eq(systemVideoAssets.active, true))
    .orderBy(asc(systemVideoAssets.type), asc(systemVideoAssets.displayName));
}

export async function resolveSystemVideoAssetSelection(
  id: string | null | undefined,
  type: SystemVideoAssetKind,
) {
  const resolvedId = id === undefined ? DEFAULT_SYSTEM_VIDEO_ASSET_ID[type] : id;
  if (resolvedId === null) return null;
  const [asset] = await getDb()
    .select()
    .from(systemVideoAssets)
    .where(
      and(
        eq(systemVideoAssets.id, resolvedId),
        eq(systemVideoAssets.type, type),
        eq(systemVideoAssets.active, true),
      ),
    )
    .limit(1);
  if (!asset)
    throw new Error(type === "opening" ? "OPENING_ASSET_NOT_AVAILABLE" : "ENDING_ASSET_NOT_AVAILABLE");
  return asset;
}
