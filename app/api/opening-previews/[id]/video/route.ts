import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { openingPreviews, projects } from "@/lib/db/schema";
import { createReadUrl } from "@/lib/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await params;
  const [row] = await getDb()
    .select({ preview: openingPreviews, userId: projects.userId })
    .from(openingPreviews)
    .innerJoin(projects, eq(projects.id, openingPreviews.projectId))
    .where(eq(openingPreviews.id, id))
    .limit(1);
  if (!row || row.userId !== user.id || !row.preview.outputObjectKey)
    return NextResponse.json({ error: "Previewが見つかりません" }, { status: 404 });
  return NextResponse.redirect(await createReadUrl(row.preview.outputObjectKey, 300));
}
