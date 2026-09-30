import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { narrationConfig } from "@/lib/audio/config";
import {
  VOICE_PREVIEW_OPTIONS,
  VOICE_PREVIEW_TESTS,
  VOICE_PREVIEW_TEXT,
  voicePreviewObjectKey,
} from "@/lib/audio/voice-preview";
import { isAdminEmail } from "@/lib/ui/presentation";
import { getDb } from "@/lib/db";
import { audioRecords, elevenLabsGenerationAudits } from "@/lib/db/schema";
import { privateObjectExists } from "@/lib/storage";
import { checkElevenLabsVoiceAccess } from "@/lib/audio/voice-access";
import { VoicePreviewClient } from "./voice-preview-client";

export const metadata: Metadata = { title: "ElevenLabs Voice比較" };

export default async function VoicePreviewPage() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  const config = narrationConfig();
  const recentNarrations = await getDb()
    .select({
      id: audioRecords.id,
      model: audioRecords.model,
      voiceId: audioRecords.voiceId,
      language: audioRecords.language,
      script: audioRecords.script,
      status: audioRecords.status,
      createdAt: audioRecords.createdAt,
    })
    .from(audioRecords)
    .where(eq(audioRecords.provider, "elevenlabs"))
    .orderBy(desc(audioRecords.createdAt))
    .limit(5);
  const recentPreviewAudits = await getDb()
    .select()
    .from(elevenLabsGenerationAudits)
    .where(eq(elevenLabsGenerationAudits.purpose, "voice_preview"))
    .orderBy(desc(elevenLabsGenerationAudits.generatedAt))
    .limit(12);
  const savedPairs = await Promise.all(
    VOICE_PREVIEW_OPTIONS.flatMap((option) =>
      VOICE_PREVIEW_TESTS.map(async (test) => {
        const rawKey = voicePreviewObjectKey(option.voiceId, test.id, "raw");
        const normalizedKey = voicePreviewObjectKey(option.voiceId, test.id, "normalized");
        const [raw, normalized] = await Promise.all([
          privateObjectExists(rawKey),
          privateObjectExists(normalizedKey),
        ]);
        return {
          key: `${option.voiceId}:${test.id}`,
          value:
            raw && normalized
              ? {
                  rawAudioUrl: `/api/admin/voice-preview?voiceId=${encodeURIComponent(option.voiceId)}&testId=${test.id}&variant=raw`,
                  normalizedAudioUrl: `/api/admin/voice-preview?voiceId=${encodeURIComponent(option.voiceId)}&testId=${test.id}&variant=normalized`,
                  message: "R2保存済み音声です。",
                }
              : undefined,
        };
      }),
    ),
  );
  const initialResults = Object.fromEntries(
    savedPairs.filter((entry) => entry.value).map((entry) => [entry.key, entry.value!]),
  );
  const voiceAccess = await Promise.all(
    VOICE_PREVIEW_OPTIONS.map((option) => checkElevenLabsVoiceAccess(option.voiceId)),
  );
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <p className="eyebrow">管理者専用 · Gold Khanjar品質確認</p>
          <h1>ElevenLabs Voice A / B比較</h1>
          <p className="lead">
            Pipeline監査中です。新規生成はHuman承認までサーバー側で停止しています。
          </p>
        </div>
        <Link href="/admin" className="btn">
          管理トップへ
        </Link>
      </div>
      <section className="panel">
        <p className="eyebrow">監査対象となった比較テスト文</p>
        <p>{VOICE_PREVIEW_TEXT}</p>
      </section>
      <section className="panel">
        <p className="eyebrow">Production設定（秘密情報を除外）</p>
        <p>Model: {config.model}</p>
        <p>Output: mp3_44100_128 / Language: ja / Speed: 1.00</p>
        <p>旧設定: stability 0.58 / similarity 0.76 / style 0.12 / speaker boost ON</p>
        <p>
          修正後: stability 0.58 / similarity 0.76 / style 0 / speaker boost ON / 日本語正規化 ON
        </p>
        {voiceAccess.map((voice, index) => (
          <p key={voice.voiceId}>
            {VOICE_PREVIEW_OPTIONS[index].label}:{" "}
            {voice.accessible
              ? "Voice参照可"
              : voice.status === 401 || voice.status === 403
                ? "Voice参照権限なし（TTS可否は生成時確認）"
                : voice.status === 404
                  ? "Voice未登録"
                  : "Voice参照失敗"}
            {voice.name ? ` / ${voice.name}` : ""} / status {voice.status || "network"}
          </p>
        ))}
      </section>
      <section className="panel">
        <p className="eyebrow">直近の本番Narration記録</p>
        {recentNarrations.length ? (
          recentNarrations.map((record) => (
            <article key={record.id}>
              <p>
                {record.createdAt.toLocaleString("ja-JP")} · {record.status} · {record.model} ·{" "}
                {record.voiceId}
              </p>
              <p className="hint">{record.script}</p>
            </article>
          ))
        ) : (
          <p>記録はありません。</p>
        )}
      </section>
      <section className="panel">
        <p className="eyebrow">Voice Preview送信監査ログ</p>
        {recentPreviewAudits.length ? (
          recentPreviewAudits.map((record) => (
            <article key={record.id}>
              <p>
                {record.generatedAt.toLocaleString("ja-JP")} · {record.voiceId} · {record.model} ·
                {" "}{record.outputFormat} · {record.characterCost ?? "—"} units
              </p>
              <p className="hint">originalScript: {record.originalScript}</p>
              <p className="hint">ttsInputText: {record.ttsInputText}</p>
              <p className="hint">
                settings: {JSON.stringify(record.voiceSettings)} / language: {record.language} /
                normalize: {record.applyTextNormalization} / language normalize:{" "}
                {record.applyLanguageTextNormalization ? "true" : "false"} / seed:{" "}
                {record.seed ?? "未指定"}
              </p>
            </article>
          ))
        ) : (
          <p>Preview送信記録はありません。</p>
        )}
      </section>
      <section className="panel">
        <p className="eyebrow">次回の分割テスト（未生成）</p>
        {VOICE_PREVIEW_TESTS.map((test) => (
          <p key={test.id}>
            <strong>{test.label}</strong>：{test.text}
          </p>
        ))}
      </section>
      <VoicePreviewClient
        options={[...VOICE_PREVIEW_OPTIONS]}
        tests={[...VOICE_PREVIEW_TESTS]}
        generationEnabled={process.env.ELEVENLABS_VOICE_PREVIEW_GENERATION_ENABLED === "true"}
        initialResults={initialResults}
      />
    </main>
  );
}
