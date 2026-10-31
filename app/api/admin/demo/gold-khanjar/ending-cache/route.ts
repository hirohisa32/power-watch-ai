import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { GOLD_KHANJAR_FULL_PREFIX } from "@/lib/demo/gold-khanjar-full";
import { SYSTEM_VIDEO_ASSET_IDS } from "@/lib/system-media/config";
import { assertSameOrigin } from "@/lib/security";
import { uploadPrivateObject } from "@/lib/storage";
import { isAdminEmail } from "@/lib/ui/presentation";

export async function POST(request: Request) {
  await assertSameOrigin(request);
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.name !== "ending-v4.mp4" || file.type !== "video/mp4" || file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "承認済みEndingキャッシュを確認してください" }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder().decode(bytes.slice(4, 12)).includes("ftyp")) return NextResponse.json({ error: "MP4内容を確認できません" }, { status: 400 });
  const key = `${GOLD_KHANJAR_FULL_PREFIX}/refined-system/v4/ending-${SYSTEM_VIDEO_ASSET_IDS.endingPowerWatch}.mp4`;
  await uploadPrivateObject(key, bytes, "video/mp4");
  return NextResponse.json({ endingReady: true });
}
