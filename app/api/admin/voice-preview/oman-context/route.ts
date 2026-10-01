import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveElevenLabsGenerationAudit, updateElevenLabsAuditDuration } from "@/lib/audio/audit";
import { ElevenLabsError, ElevenLabsNarrationProvider } from "@/lib/audio/elevenlabs";
import { normalizeVoicePreviewAudio } from "@/lib/audio/normalize";
import { omanContextInputSchema, omanContextObjectKey, omanContextTest } from "@/lib/audio/oman-context-preview";
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
    const parsed = omanContextInputSchema.parse({ voiceId: url.searchParams.get("voiceId") ?? "", testId: url.searchParams.get("testId") ?? "" });
    const variant = url.searchParams.get("variant") === "raw" ? "raw" : "normalized";
    const key = omanContextObjectKey(parsed.voiceId, parsed.testId, variant);
    if (!(await privateObjectExists(key))) return NextResponse.json({ error: "Previewはまだ生成されていません" }, { status: 404 });
    return NextResponse.redirect(await createReadUrl(key, 300, "inline"));
  } catch (error) {
    return apiError(error, "Context Previewを取得できませんでした");
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const denied = await requireAdmin();
    if (denied) return denied;
    if (process.env.ELEVENLABS_VOICE_PREVIEW_GENERATION_ENABLED !== "true") return NextResponse.json({ error: "Human承認された局所テスト以外の生成を停止しています" }, { status: 409 });
    const parsed = omanContextInputSchema.parse(await request.json());
    const test = omanContextTest(parsed.testId);
    if (!test) return NextResponse.json({ error: "テスト文が不正です" }, { status: 400 });
    const rawKey = omanContextObjectKey(parsed.voiceId, test.id, "raw");
    const normalizedKey = omanContextObjectKey(parsed.voiceId, test.id, "normalized");
    const rawAudioUrl = `/api/admin/voice-preview/oman-context?voiceId=${encodeURIComponent(parsed.voiceId)}&testId=${test.id}&variant=raw`;
    const normalizedAudioUrl = `/api/admin/voice-preview/oman-context?voiceId=${encodeURIComponent(parsed.voiceId)}&testId=${test.id}&variant=normalized`;
    const [rawExists, normalizedExists] = await Promise.all([privateObjectExists(rawKey), privateObjectExists(normalizedKey)]);
    if (rawExists && normalizedExists) return NextResponse.json({ rawAudioUrl, normalizedAudioUrl, reused: true });
    let rawBytes: Uint8Array;
    let auditId: string | undefined;
    let characterCost: number | undefined;
    if (rawExists) rawBytes = await readPrivateObject(rawKey);
    else {
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
    return apiError(error, "Context Previewを生成できませんでした");
  }
}
