import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { japaneseReadingDictionary } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { isAdminEmail } from "@/lib/ui/presentation";

const inputSchema = z.object({
  display: z.string().trim().min(1).max(120),
  reading: z.string().trim().min(1).max(240).refine((value) => !/[ \t]/.test(value), "読みには不要な半角空白を使用できません"),
  projectId: z.string().uuid().optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    if (!isAdminEmail(user.email)) return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    const input = inputSchema.parse(await request.json());
    const db = getDb();
    const scope = input.projectId
      ? and(eq(japaneseReadingDictionary.projectId, input.projectId), eq(japaneseReadingDictionary.display, input.display))
      : and(isNull(japaneseReadingDictionary.projectId), eq(japaneseReadingDictionary.display, input.display));
    const [existing] = await db.select({ id: japaneseReadingDictionary.id }).from(japaneseReadingDictionary).where(scope).limit(1);
    if (existing) {
      await db.update(japaneseReadingDictionary).set({ reading: input.reading, notes: input.notes, source: "human", approved: true, updatedAt: new Date() }).where(eq(japaneseReadingDictionary.id, existing.id));
      return NextResponse.json({ id: existing.id, updated: true });
    }
    const [created] = await db.insert(japaneseReadingDictionary).values({ projectId: input.projectId, display: input.display, reading: input.reading, notes: input.notes, source: "human", approved: true }).returning({ id: japaneseReadingDictionary.id });
    return NextResponse.json({ id: created.id, updated: false }, { status: 201 });
  } catch (error) {
    return apiError(error, "日本語発音辞書を保存できませんでした");
  }
}
