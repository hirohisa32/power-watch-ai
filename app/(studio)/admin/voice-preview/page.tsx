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
} from "@/lib/audio/voice-preview";
import { isAdminEmail } from "@/lib/ui/presentation";
import { getDb } from "@/lib/db";
import { audioRecords } from "@/lib/db/schema";
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
      />
    </main>
  );
}
