import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { finalRenders } from "@/lib/db/schema";
import { assertSameOrigin } from "@/lib/security";
import { uploadPrivateObject } from "@/lib/storage";
import { isAdminEmail } from "@/lib/ui/presentation";

const RENDER_ID = "de0b7b81-030e-4c6d-956b-ddfbbe1aa3f3";
const SIZE = 30_432_947;
const SHA256 = "8c5bb449a703f79dff3cde1f365a038edcce8cb64c2151ae3ee7d9ab23e9e87e";

export async function POST(request: Request) {
  await assertSameOrigin(request);
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.name !== "gold-khanjar-refined-final.mp4" || file.type !== "video/mp4" || file.size !== SIZE) return NextResponse.json({ error: "修復済みFinal MP4を確認してください" }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== SHA256) return NextResponse.json({ error: "Final MP4ハッシュが一致しません" }, { status: 400 });
  const [render] = await getDb().select({ id: finalRenders.id, outputObjectKey: finalRenders.outputObjectKey }).from(finalRenders).where(eq(finalRenders.id, RENDER_ID)).limit(1);
  if (!render?.outputObjectKey) return NextResponse.json({ error: "対象Final Renderが見つかりません" }, { status: 404 });
  await uploadPrivateObject(render.outputObjectKey, bytes, "video/mp4");
  await getDb().update(finalRenders).set({ durationMs: 65160, updatedAt: new Date() }).where(eq(finalRenders.id, RENDER_ID));
  return NextResponse.json({ repaired: true });
}
