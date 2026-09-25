import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { projects, videoGenerations } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { createReadUrl } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id } = await params;
    const [generation] = await getDb()
      .select({ outputObjectKey: videoGenerations.outputObjectKey })
      .from(videoGenerations)
      .innerJoin(projects, eq(projects.id, videoGenerations.projectId))
      .where(
        and(
          eq(videoGenerations.id, id),
          eq(videoGenerations.status, "completed"),
          eq(projects.userId, user.id),
        ),
      )
      .limit(1);
    if (!generation?.outputObjectKey)
      return NextResponse.json({ error: "動画が見つかりません" }, { status: 404 });
    return NextResponse.redirect(await createReadUrl(generation.outputObjectKey, 15 * 60));
  } catch (error) {
    return apiError(error, "動画を開けませんでした");
  }
}
