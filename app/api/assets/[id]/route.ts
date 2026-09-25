import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assets, projects } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { createReadUrl } from "@/lib/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id } = await params;
    const [asset] = await getDb()
      .select({ objectKey: assets.objectKey })
      .from(assets)
      .innerJoin(projects, eq(projects.id, assets.projectId))
      .where(and(eq(assets.id, id), eq(projects.userId, user.id)))
      .limit(1);
    if (!asset) return NextResponse.json({ error: "画像が見つかりません" }, { status: 404 });
    return NextResponse.redirect(await createReadUrl(asset.objectKey));
  } catch (error) {
    return apiError(error, "画像を表示できませんでした");
  }
}
