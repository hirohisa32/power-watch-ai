import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { findLatestVoicePreviewAudit, saveElevenLabsGenerationAudit, updateElevenLabsAuditDuration } from "@/lib/audio/audit";
import { ElevenLabsError, ElevenLabsNarrationProvider } from "@/lib/audio/elevenlabs";
import { normalizeVoicePreviewAudio } from "@/lib/audio/normalize";
import { omanPronunciationInputSchema, omanPronunciationObjectKey, omanPronunciationTest } from "@/lib/audio/oman-pronunciation-preview";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { createReadUrl, privateObjectExists, readPrivateObject, uploadPrivateObject } from "@/lib/storage";
import { isAdminEmail } from "@/lib/ui/presentation";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  return null;
}

export async function GET(request: Request) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;
    const url = new URL(request.url);
    const parsed = omanPronunciationInputSchema.parse({ voiceId: url.searchParams.get("voiceId") ?? "", testId: url.searchParams.get("testId") ?? "" });
    const variant = url.searchParams.get("variant") === "raw" ? "raw" : "normalized";
    const key = omanPronunciationObjectKey(parsed.voiceId, parsed.testId, variant);
    if (!(await privateObjectExists(key))) return NextResponse.json({ error: "Previewはまだ生成されていません" }, { status: 404 });
    return NextResponse.redirect(await createReadUrl(key, 300, "inline"));
  } catch (error) {
    return apiError(error, "オマーン発音Previewを取得できませんでした");
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const denied = await requireAdmin();
    if (denied) return denied;
    if (process.env.ELEVENLABS_VOICE_PREVIEW_GENERATION_ENABLED !== "true") return NextResponse.json({ error: "Human承認まで新規Voice生成を停止しています" }, { status: 409 });
    const parsed = omanPronunciationInputSchema.parse(await request.json());
    const test = omanPronunciationTest(parsed.testId);
    if (!test) return NextResponse.json({ error: "テスト文が不正です" }, { status: 400 });
    const rawKey = omanPronunciationObjectKey(parsed.voiceId, parsed.testId, "raw");
    const normalizedKey = omanPronunciationObjectKey(parsed.voiceId, parsed.testId, "normalized");
    const rawAudioUrl = `/api/admin/voice-preview/oman?voiceId=${encodeURIComponent(parsed.voiceId)}&testId=${test.id}&variant=raw`;
    const normalizedAudioUrl = `/api/admin/voice-preview/oman?voiceId=${encodeURIComponent(parsed.voiceId)}&testId=${test.id}&variant=normalized`;
    const [rawExists, normalizedExists] = await Promise.all([privateObjectExists(rawKey), privateObjectExists(normalizedKey)]);
    if (rawExists && normalizedExists) return NextResponse.json({ rawAudioUrl, normalizedAudioUrl, reused: true });
    const previous = await findLatestVoicePreviewAudit(parsed.voiceId, test.ttsInputText);
    let rawBytes: Uint8Array;
    let auditId = previous?.id;
    let characterCost = previous?.characterCost ?? undefined;
    if (rawExists) rawBytes = await readPrivateObject(rawKey);
    else {
      if (previous?.requestId) return NextResponse.json({ error: "同一Textの送信履歴があるため、重複生成を停止しました" }, { status: 409 });
      const result = await new ElevenLabsNarrationProvider().generate({ originalScript: test.displayScript, text: test.ttsInputText, speed: 1, voiceId: parsed.voiceId, language: "ja" });
      rawBytes = result.bytes;
      characterCost = result.characterCost;
      if (result.audit) auditId = (await saveElevenLabsGenerationAudit({ audit: result.audit, purpose: "voice_preview", requestId: result.requestId, characterCost: result.characterCost, readingMap: [...test.applied] }))?.id;
      await uploadPrivateObject(rawKey, rawBytes, result.contentType);
    }
    const normalized = await normalizeVoicePreviewAudio(rawBytes);
    await uploadPrivateObject(normalizedKey, normalized.bytes, "audio/mpeg");
    if (auditId && normalized.durationSeconds !== undefined) await updateElevenLabsAuditDuration(auditId, normalized.durationSeconds);
    return NextResponse.json({ rawAudioUrl, normalizedAudioUrl, reused: rawExists, characterCost, durationSeconds: normalized.durationSeconds });
  } catch (error) {
    if (error instanceof ElevenLabsError) return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    return apiError(error, "オマーン発音Previewを生成できませんでした");
  }
}
