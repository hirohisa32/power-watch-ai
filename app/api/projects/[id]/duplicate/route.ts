import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id } = await params;
    const db = getDb();
    const [source] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
      .limit(1);
    if (!source)
      return NextResponse.json({ error: "プロジェクトが見つかりません" }, { status: 404 });
    const [copy] = await db
      .insert(projects)
      .values({
        userId: user.id,
        title: `${source.title} — Copy`,
        script: source.script,
        style: source.style,
        language: source.language,
        targetDuration: source.targetDuration,
      })
      .returning({ id: projects.id });
    return NextResponse.json(copy, { status: 201 });
  } catch (error) {
    return apiError(error, "プロジェクトを複製できませんでした");
  }
}
