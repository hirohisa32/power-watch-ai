import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  findLatestVoicePreviewAudit,
  saveElevenLabsGenerationAudit,
  updateElevenLabsAuditCost,
  updateElevenLabsAuditDuration,
} from "@/lib/audio/audit";
import { narrationConfig } from "@/lib/audio/config";
import { ElevenLabsError, ElevenLabsNarrationProvider } from "@/lib/audio/elevenlabs";
import { normalizeVoicePreviewAudio } from "@/lib/audio/normalize";
import { checkElevenLabsVoiceAccess } from "@/lib/audio/voice-access";
import {
  voicePreviewInputSchema,
  voicePreviewObjectKey,
  voicePreviewTest,
} from "@/lib/audio/voice-preview";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import {
  createReadUrl,
  privateObjectExists,
  readPrivateObject,
  uploadPrivateObject,
} from "@/lib/storage";
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
    const rawExists = await privateObjectExists(rawKey);
    const normalizedExists = await privateObjectExists(normalizedKey);
    if (rawExists && normalizedExists)
      return NextResponse.json({ rawAudioUrl, normalizedAudioUrl, reused: true });

    let rawBytes: Uint8Array;
    let characterCost: number | undefined;
    let requestId: string | undefined;
    let auditId: string | undefined;
    let recovered = false;
    const previous = await findLatestVoicePreviewAudit(parsed.voiceId, test.ttsInputText);
    if (rawExists) {
      rawBytes = await readPrivateObject(rawKey);
      auditId = previous?.id;
      recovered = true;
    } else {
      if (previous?.requestId) {
        const history = await recoverElevenLabsHistoryAudio(
          previous.requestId,
          parsed.voiceId,
          test.ttsInputText,
        );
        if (!history)
          return NextResponse.json(
            { error: "送信済み音声をElevenLabs履歴から回収できないため、重複生成を停止しました" },
            { status: 409 },
          );
        rawBytes = history.bytes;
        characterCost = history.characterCost;
        requestId = previous.requestId;
        auditId = previous.id;
        recovered = true;
        await uploadPrivateObject(rawKey, rawBytes, history.contentType);
        await updateElevenLabsAuditCost(previous.id, history.characterCost);
      } else {
        const voiceAccess = await checkElevenLabsVoiceAccess(parsed.voiceId);
        if (!voiceAccess.accessible && voiceAccess.status === 404)
          return NextResponse.json(
            {
              error: "指定VoiceはProduction API KeyのVoice Collectionに存在しません",
              code: "VOICE_NOT_ACCESSIBLE",
            },
            { status: 409 },
          );
        const result = await new ElevenLabsNarrationProvider().generate({
          originalScript: test.displayScript,
          text: test.ttsInputText,
          speed: 1,
          voiceId: parsed.voiceId,
          language: "ja",
        });
        rawBytes = result.bytes;
        characterCost = result.characterCost;
        requestId = result.requestId;
        if (result.audit) {
          const auditRecord = await saveElevenLabsGenerationAudit({
            audit: result.audit,
            purpose: "voice_preview",
            requestId: result.requestId,
            characterCost: result.characterCost,
            readingMap: test.applied,
          });
          auditId = auditRecord?.id;
        }
        // Persist paid output before optional post-processing so a retry never calls TTS twice.
        await uploadPrivateObject(rawKey, result.bytes, result.contentType);
      }
    }
    const normalized = await normalizeVoicePreviewAudio(rawBytes);
    await uploadPrivateObject(normalizedKey, normalized.bytes, "audio/mpeg");
    if (auditId && normalized.durationSeconds !== undefined)
      await updateElevenLabsAuditDuration(auditId, normalized.durationSeconds);
    return NextResponse.json({
      rawAudioUrl,
      normalizedAudioUrl,
      reused: recovered,
      recovered,
      characterCost,
      durationSeconds: normalized.durationSeconds,
      requestId,
    });
  } catch (error) {
    if (error instanceof ElevenLabsError)
      return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    return apiError(error, "Voice Previewを生成できませんでした");
  }
}

async function recoverElevenLabsHistoryAudio(
  requestId: string,
  voiceId: string,
  text: string,
) {
  const config = narrationConfig();
  if (!config.apiKey) throw new ElevenLabsError("AUTH", "ElevenLabsの設定が不足しています");
  const params = new URLSearchParams({ page_size: "100", source: "TTS", search: text });
  const historyResponse = await fetch(`https://api.elevenlabs.io/v1/history?${params}`, {
    headers: { "xi-api-key": config.apiKey },
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!historyResponse.ok) return null;
  const body = (await historyResponse.json()) as {
    history?: Array<{
      history_item_id?: string;
      request_id?: string;
      voice_id?: string;
      text?: string;
      content_type?: string;
      character_count_change_from?: number;
      character_count_change_to?: number;
    }>;
  };
  const item = body.history?.find(
    (candidate) =>
      candidate.request_id === requestId && candidate.voice_id === voiceId && candidate.text === text,
  );
  if (!item?.history_item_id) return null;
  const audioResponse = await fetch(
    `https://api.elevenlabs.io/v1/history/${encodeURIComponent(item.history_item_id)}/audio`,
    {
      headers: { "xi-api-key": config.apiKey },
      signal: AbortSignal.timeout(config.timeoutMs),
    },
  );
  if (!audioResponse.ok) return null;
  const from = item.character_count_change_from ?? 0;
  const to = item.character_count_change_to ?? from + [...text].length;
  return {
    bytes: new Uint8Array(await audioResponse.arrayBuffer()),
    contentType: audioResponse.headers.get("content-type") || item.content_type || "audio/mpeg",
    characterCost: Math.max(0, to - from) || [...text].length,
  };
}
