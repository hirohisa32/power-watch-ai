import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ElevenLabsError, ElevenLabsNarrationProvider } from "@/lib/audio/elevenlabs";
import {
  VOICE_PREVIEW_TEXT,
  voicePreviewInputSchema,
  voicePreviewObjectKey,
} from "@/lib/audio/voice-preview";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { createReadUrl, privateObjectExists, uploadPrivateObject } from "@/lib/storage";
import { isAdminEmail } from "@/lib/ui/presentation";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isAdminEmail(user.email))
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  return null;
}

export async function GET(request: Request) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;
    const voiceId = new URL(request.url).searchParams.get("voiceId") ?? "";
    const parsed = voicePreviewInputSchema.parse({ voiceId });
    const key = voicePreviewObjectKey(parsed.voiceId);
    if (!(await privateObjectExists(key)))
      return NextResponse.json({ error: "Previewはまだ生成されていません" }, { status: 404 });
    return NextResponse.redirect(await createReadUrl(key, 300, "inline"));
  } catch (error) {
    return apiError(error, "Voice Previewを取得できませんでした");
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const denied = await requireAdmin();
    if (denied) return denied;
    const parsed = voicePreviewInputSchema.parse(await request.json());
    const key = voicePreviewObjectKey(parsed.voiceId);
    const audioUrl = `/api/admin/voice-preview?voiceId=${encodeURIComponent(parsed.voiceId)}`;
    if (await privateObjectExists(key)) return NextResponse.json({ audioUrl, reused: true });

    const result = await new ElevenLabsNarrationProvider().generate({
      text: VOICE_PREVIEW_TEXT,
      speed: 1,
      voiceId: parsed.voiceId,
    });
    await uploadPrivateObject(key, result.bytes, result.contentType);
    return NextResponse.json({
      audioUrl,
      reused: false,
      characterCost: result.characterCost,
      requestId: result.requestId,
    });
  } catch (error) {
    if (error instanceof ElevenLabsError)
      return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    return apiError(error, "Voice Previewを生成できませんでした");
  }
}
