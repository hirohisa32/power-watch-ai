import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { bgmAssets } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { isAdminEmail } from "@/lib/ui/presentation";
import { bgmAdminUpdateSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    if (!isAdminEmail(user.email))
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    const input = bgmAdminUpdateSchema.parse(await request.json());
    const { id } = await params;
    const [updated] = await getDb()
      .update(bgmAssets)
      .set({ ...input, acquiredAt: input.acquiredAt ? new Date(input.acquiredAt) : null, updatedAt: new Date() })
      .where(eq(bgmAssets.id, id))
      .returning();
    if (!updated) return NextResponse.json({ error: "BGMが見つかりません" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    return apiError(error, "BGM情報を保存できませんでした");
  }
}
