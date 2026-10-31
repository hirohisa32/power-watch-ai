import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { systemVideoAssets } from "@/lib/db/schema";
import { createReadUrl } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await params;
  const [asset] = await getDb()
    .select({ storagePath: systemVideoAssets.storagePath })
    .from(systemVideoAssets)
    .where(and(eq(systemVideoAssets.id, id), eq(systemVideoAssets.active, true)))
    .limit(1);
  if (!asset) return NextResponse.json({ error: "動画素材が見つかりません" }, { status: 404 });
  return NextResponse.redirect(await createReadUrl(asset.storagePath, 15 * 60, "inline"));
}
