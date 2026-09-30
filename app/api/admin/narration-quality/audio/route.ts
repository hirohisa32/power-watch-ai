import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { narrationQualitySegments } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { createReadUrl, privateObjectExists } from "@/lib/storage";
import { isAdminEmail } from "@/lib/ui/presentation";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    if (!isAdminEmail(user.email)) return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    const segmentId = z.string().uuid().parse(new URL(request.url).searchParams.get("segmentId"));
    const [segment] = await getDb().select({ key: narrationQualitySegments.normalizedObjectKey }).from(narrationQualitySegments).where(eq(narrationQualitySegments.id, segmentId)).limit(1);
    if (!segment?.key || !(await privateObjectExists(segment.key))) return NextResponse.json({ error: "音声がありません" }, { status: 404 });
    return NextResponse.redirect(await createReadUrl(segment.key, 300, "inline"));
  } catch (error) {
    return apiError(error, "品質確認音声を取得できませんでした");
  }
}
