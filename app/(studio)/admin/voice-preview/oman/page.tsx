import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { elevenLabsGenerationAudits } from "@/lib/db/schema";
import { OMAN_PRONUNCIATION_TESTS, omanPronunciationObjectKey } from "@/lib/audio/oman-pronunciation-preview";
import { VOICE_PREVIEW_OPTIONS } from "@/lib/audio/voice-preview";
import { privateObjectExists } from "@/lib/storage";
import { isAdminEmail } from "@/lib/ui/presentation";
import { VoicePreviewClient } from "../voice-preview-client";

export const metadata: Metadata = { title: "オマーン発音比較" };
export const dynamic = "force-dynamic";

export default async function OmanPronunciationPage() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  const audits = await getDb().select().from(elevenLabsGenerationAudits).where(eq(elevenLabsGenerationAudits.purpose, "voice_preview")).orderBy(desc(elevenLabsGenerationAudits.generatedAt)).limit(80);
  const saved = await Promise.all(VOICE_PREVIEW_OPTIONS.flatMap((option) => OMAN_PRONUNCIATION_TESTS.map(async (test) => {
    const rawKey = omanPronunciationObjectKey(option.voiceId, test.id, "raw");
    const normalizedKey = omanPronunciationObjectKey(option.voiceId, test.id, "normalized");
    const [raw, normalized] = await Promise.all([privateObjectExists(rawKey), privateObjectExists(normalizedKey)]);
    const audit = audits.find((record) => record.voiceId === option.voiceId && record.ttsInputText === test.ttsInputText);
    return { key: `${option.voiceId}:${test.id}`, value: raw && normalized ? { rawAudioUrl: `/api/admin/voice-preview/oman?voiceId=${option.voiceId}&testId=${test.id}&variant=raw`, normalizedAudioUrl: `/api/admin/voice-preview/oman?voiceId=${option.voiceId}&testId=${test.id}&variant=normalized`, message: "R2保存済み音声です。", characterCost: audit?.characterCost ?? undefined, durationSeconds: audit?.durationSeconds ?? undefined } : undefined };
  })));
  const initialResults = Object.fromEntries(saved.filter((entry) => entry.value).map((entry) => [entry.key, entry.value!]));
  return <main className="content"><div className="page-head"><div><p className="eyebrow">管理者専用 · 固有名詞発音確認</p><h1>「オマーン」Pronunciation比較</h1><p className="lead">単語表記と文脈によるアクセント差をVoice A / B同条件で比較します。本番Narrationは生成しません。</p></div><Link href="/admin/voice-preview" className="btn">Voice比較へ戻る</Link></div><section className="panel"><h2>Human確認観点</h2><p>「オ」の高さ／「マー」の伸ばし方／語尾の「ン」／単語単体と文章内の差／ニュース・ドキュメンタリーとしての自然さ</p><p><Link href="/admin/voice-preview/oman-context" className="btn">Context-aware局所テストへ</Link></p></section><VoicePreviewClient options={[...VOICE_PREVIEW_OPTIONS]} tests={OMAN_PRONUNCIATION_TESTS.map(({ id, label, displayScript, ttsInputText }) => ({ id, label, displayScript, ttsInputText }))} generationEnabled={process.env.ELEVENLABS_VOICE_PREVIEW_GENERATION_ENABLED === "true"} initialResults={initialResults} endpoint="/api/admin/voice-preview/oman" /></main>;
}
