import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { bgmAssets } from "@/lib/db/schema";
import { createReadUrl } from "@/lib/storage";
import { isAdminEmail } from "@/lib/ui/presentation";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await params;
  const [item] = await getDb().select().from(bgmAssets).where(eq(bgmAssets.id, id)).limit(1);
  if (!item || (!item.active && !isAdminEmail(user.email)))
    return NextResponse.json({ error: "BGMが見つかりません" }, { status: 404 });
  return NextResponse.redirect(await createReadUrl(item.filePath, 900));
}
