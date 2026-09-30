import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveElevenLabsGenerationAudit } from "@/lib/audio/audit";
import { ElevenLabsError, ElevenLabsNarrationProvider } from "@/lib/audio/elevenlabs";
import { normalizeVoicePreviewAudio } from "@/lib/audio/normalize";
import {
  voicePreviewInputSchema,
  voicePreviewObjectKey,
  voicePreviewTest,
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
    const url = new URL(request.url);
    const parsed = voicePreviewInputSchema.parse({
      voiceId: url.searchParams.get("voiceId") ?? "",
      testId: url.searchParams.get("testId") ?? "",
    });
    const variant = url.searchParams.get("variant") === "raw" ? "raw" : "normalized";
    const key = voicePreviewObjectKey(parsed.voiceId, parsed.testId, variant);
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
    if (process.env.ELEVENLABS_VOICE_PREVIEW_GENERATION_ENABLED !== "true")
      return NextResponse.json(
        { error: "Pipeline監査中のため、Human承認まで新規Voice生成を停止しています" },
        { status: 409 },
      );
    const test = voicePreviewTest(parsed.testId);
    if (!test) return NextResponse.json({ error: "テスト文が不正です" }, { status: 400 });
    const rawKey = voicePreviewObjectKey(parsed.voiceId, parsed.testId, "raw");
    const normalizedKey = voicePreviewObjectKey(parsed.voiceId, parsed.testId, "normalized");
    const rawAudioUrl = `/api/admin/voice-preview?voiceId=${encodeURIComponent(parsed.voiceId)}&testId=${encodeURIComponent(parsed.testId)}&variant=raw`;
    const normalizedAudioUrl = `/api/admin/voice-preview?voiceId=${encodeURIComponent(parsed.voiceId)}&testId=${encodeURIComponent(parsed.testId)}&variant=normalized`;
    if ((await privateObjectExists(rawKey)) && (await privateObjectExists(normalizedKey)))
      return NextResponse.json({ rawAudioUrl, normalizedAudioUrl, reused: true });

    const result = await new ElevenLabsNarrationProvider().generate({
      originalScript: test.text,
      text: test.text,
      speed: 1,
      voiceId: parsed.voiceId,
      language: "ja",
    });
    if (result.audit)
      await saveElevenLabsGenerationAudit({
        audit: result.audit,
        purpose: "voice_preview",
        requestId: result.requestId,
      });
    const normalizedBytes = await normalizeVoicePreviewAudio(result.bytes);
    await uploadPrivateObject(rawKey, result.bytes, result.contentType);
    await uploadPrivateObject(normalizedKey, normalizedBytes, "audio/mpeg");
    return NextResponse.json({
      rawAudioUrl,
      normalizedAudioUrl,
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
