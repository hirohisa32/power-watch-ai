import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { finalRenders, projects } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { createReadUrl } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id } = await params;
    const [render] = await getDb()
      .select({ outputObjectKey: finalRenders.outputObjectKey, projectId: finalRenders.projectId })
      .from(finalRenders)
      .innerJoin(projects, eq(projects.id, finalRenders.projectId))
      .where(
        and(
          eq(finalRenders.id, id),
          eq(finalRenders.status, "completed"),
          eq(projects.userId, user.id),
        ),
      )
      .limit(1);
    if (!render?.outputObjectKey)
      return NextResponse.json({ error: "完成動画が見つかりません" }, { status: 404 });
    const filename = `power-watch-${render.projectId}.mp4`;
    return NextResponse.redirect(
      await createReadUrl(render.outputObjectKey, 5 * 60, `attachment; filename="${filename}"`),
    );
  } catch (error) {
    return apiError(error, "MP4をダウンロードできませんでした");
  }
}
