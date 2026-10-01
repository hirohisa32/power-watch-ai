import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { MODEL_COMPARISON_OPTIONS, MODEL_COMPARISON_TEXT, modelComparisonObjectKey } from "@/lib/audio/model-comparison-preview";
import { elevenLabsGenerationAudits } from "@/lib/db/schema";
import { privateObjectExists } from "@/lib/storage";
import { isAdminEmail } from "@/lib/ui/presentation";
import { ModelComparisonClient } from "./model-comparison-client";

export const metadata: Metadata = { title: "ElevenLabs v2 / v4比較" };
export const dynamic = "force-dynamic";

export default async function ModelComparisonPage() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  const audits = await getDb().select().from(elevenLabsGenerationAudits).where(eq(elevenLabsGenerationAudits.purpose, "voice_preview")).orderBy(desc(elevenLabsGenerationAudits.generatedAt)).limit(30);
  const saved = await Promise.all(MODEL_COMPARISON_OPTIONS.map(async (option) => {
    const rawKey = modelComparisonObjectKey(option.voiceId, option.model, "raw");
    const normalizedKey = modelComparisonObjectKey(option.voiceId, option.model, "normalized");
    const [raw, normalized] = await Promise.all([privateObjectExists(rawKey), privateObjectExists(normalizedKey)]);
    const audit = audits.find((record) => record.voiceId === option.voiceId && record.model === option.model && record.ttsInputText === MODEL_COMPARISON_TEXT);
    return { key: option.id, value: raw && normalized ? { rawAudioUrl: `/api/admin/voice-preview/model-comparison?voiceId=${option.voiceId}&model=${option.model}&variant=raw`, normalizedAudioUrl: `/api/admin/voice-preview/model-comparison?voiceId=${option.voiceId}&model=${option.model}&variant=normalized`, message: "R2保存済み音声です。", characterCost: audit?.characterCost ?? undefined, durationSeconds: audit?.durationSeconds ?? undefined } : undefined };
  }));
  const initialResults = Object.fromEntries(saved.filter((item) => item.value).map((item) => [item.key, item.value!]));
  return <main className="content"><div className="page-head"><div><p className="eyebrow">管理者専用 · 同一条件比較</p><h1>ElevenLabs multilingual_v2 / v4</h1><p className="lead">Voice A/Bを同じ文章・同じVoice Settingsで比較します。辞書・Context Rule・言い換えは使用しません。</p></div><Link href="/admin/voice-preview" className="btn">Voice比較へ戻る</Link></div><section className="panel"><h2>比較文章</h2><p style={{ whiteSpace: "pre-line" }}>{MODEL_COMPARISON_TEXT}</p><p className="hint">確認：日本語ネイティブ感／オマーン／変革期／1665／カンジャル／国家／文間／Pause／語尾／高級感</p></section><ModelComparisonClient options={[...MODEL_COMPARISON_OPTIONS]} generationEnabled={process.env.ELEVENLABS_VOICE_PREVIEW_GENERATION_ENABLED === "true"} initialResults={initialResults} /></main>;
}
