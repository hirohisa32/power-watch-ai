import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveElevenLabsGenerationAudit, updateElevenLabsAuditDuration } from "@/lib/audio/audit";
import { ElevenLabsError, ElevenLabsNarrationProvider } from "@/lib/audio/elevenlabs";
import { MODEL_COMPARISON_TEXT, modelComparisonInputSchema, modelComparisonObjectKey } from "@/lib/audio/model-comparison-preview";
import { normalizeVoicePreviewAudio } from "@/lib/audio/normalize";
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
    const parsed = modelComparisonInputSchema.parse({ voiceId: url.searchParams.get("voiceId") ?? "", model: url.searchParams.get("model") ?? "" });
    const variant = url.searchParams.get("variant") === "raw" ? "raw" : "normalized";
    const key = modelComparisonObjectKey(parsed.voiceId, parsed.model, variant);
    if (!(await privateObjectExists(key))) return NextResponse.json({ error: "Previewはまだ生成されていません" }, { status: 404 });
    return NextResponse.redirect(await createReadUrl(key, 300, "inline"));
  } catch (error) {
    return apiError(error, "Model比較Previewを取得できませんでした");
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const denied = await requireAdmin();
    if (denied) return denied;
    if (process.env.ELEVENLABS_VOICE_PREVIEW_GENERATION_ENABLED !== "true") return NextResponse.json({ error: "Human承認されたModel比較以外の生成を停止しています" }, { status: 409 });
    const parsed = modelComparisonInputSchema.parse(await request.json());
    const rawKey = modelComparisonObjectKey(parsed.voiceId, parsed.model, "raw");
    const normalizedKey = modelComparisonObjectKey(parsed.voiceId, parsed.model, "normalized");
    const query = `voiceId=${encodeURIComponent(parsed.voiceId)}&model=${encodeURIComponent(parsed.model)}`;
    const rawAudioUrl = `/api/admin/voice-preview/model-comparison?${query}&variant=raw`;
    const normalizedAudioUrl = `/api/admin/voice-preview/model-comparison?${query}&variant=normalized`;
    const [rawExists, normalizedExists] = await Promise.all([privateObjectExists(rawKey), privateObjectExists(normalizedKey)]);
    if (rawExists && normalizedExists) return NextResponse.json({ rawAudioUrl, normalizedAudioUrl, reused: true });
    let rawBytes: Uint8Array;
    let auditId: string | undefined;
    let characterCost: number | undefined;
    if (rawExists) rawBytes = await readPrivateObject(rawKey);
    else {
      const result = await new ElevenLabsNarrationProvider().generate({ originalScript: MODEL_COMPARISON_TEXT, text: MODEL_COMPARISON_TEXT, speed: 1, voiceId: parsed.voiceId, model: parsed.model, language: "ja" });
      rawBytes = result.bytes;
      characterCost = result.characterCost;
      if (result.audit) auditId = (await saveElevenLabsGenerationAudit({ audit: result.audit, purpose: "voice_preview", requestId: result.requestId, characterCost: result.characterCost, readingMap: [] }))?.id;
      await uploadPrivateObject(rawKey, rawBytes, result.contentType);
    }
    const normalized = await normalizeVoicePreviewAudio(rawBytes);
    await uploadPrivateObject(normalizedKey, normalized.bytes, "audio/mpeg");
    if (auditId && normalized.durationSeconds !== undefined) await updateElevenLabsAuditDuration(auditId, normalized.durationSeconds);
    return NextResponse.json({ rawAudioUrl, normalizedAudioUrl, reused: rawExists, characterCost, durationSeconds: normalized.durationSeconds });
  } catch (error) {
    if (error instanceof ElevenLabsError) return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    return apiError(error, "Model比較Previewを生成できませんでした");
  }
}
