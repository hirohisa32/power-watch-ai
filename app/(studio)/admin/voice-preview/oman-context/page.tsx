import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { elevenLabsGenerationAudits, pronunciationCalibrationResults } from "@/lib/db/schema";
import { OMAN_CONTEXT_TESTS, omanContextObjectKey } from "@/lib/audio/oman-context-preview";
import { VOICE_PREVIEW_OPTIONS } from "@/lib/audio/voice-preview";
import { privateObjectExists } from "@/lib/storage";
import { isAdminEmail } from "@/lib/ui/presentation";
import { VoicePreviewClient } from "../voice-preview-client";
import { ContextRuleApproval } from "./context-rule-approval";

export const metadata: Metadata = { title: "オマーン Context TTS比較" };
export const dynamic = "force-dynamic";

export default async function OmanContextPage() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  const [audits, calibration] = await Promise.all([
    getDb().select().from(elevenLabsGenerationAudits).where(eq(elevenLabsGenerationAudits.purpose, "voice_preview")).orderBy(desc(elevenLabsGenerationAudits.generatedAt)).limit(40),
    getDb().select().from(pronunciationCalibrationResults).where(eq(pronunciationCalibrationResults.targetTerm, "オマーン")).orderBy(pronunciationCalibrationResults.voiceId, pronunciationCalibrationResults.testId),
  ]);
  const saved = await Promise.all(VOICE_PREVIEW_OPTIONS.flatMap((option) => OMAN_CONTEXT_TESTS.map(async (test) => {
    const rawKey = omanContextObjectKey(option.voiceId, test.id, "raw");
    const normalizedKey = omanContextObjectKey(option.voiceId, test.id, "normalized");
    const [raw, normalized] = await Promise.all([privateObjectExists(rawKey), privateObjectExists(normalizedKey)]);
    const audit = audits.find((record) => record.voiceId === option.voiceId && record.ttsInputText === test.ttsInputText);
    return { key: `${option.voiceId}:${test.id}`, value: raw && normalized ? { rawAudioUrl: `/api/admin/voice-preview/oman-context?voiceId=${option.voiceId}&testId=${test.id}&variant=raw`, normalizedAudioUrl: `/api/admin/voice-preview/oman-context?voiceId=${option.voiceId}&testId=${test.id}&variant=normalized`, message: "R2保存済み音声です。", characterCost: audit?.characterCost ?? undefined, durationSeconds: audit?.durationSeconds ?? undefined } : undefined };
  })));
  const initialResults = Object.fromEntries(saved.filter((entry) => entry.value).map((entry) => [entry.key, entry.value!]));
  return <main className="content"><div className="page-head"><div><p className="eyebrow">管理者専用 · Context-aware TTS</p><h1>「オマーン」局所文脈テスト</h1><p className="lead">displayScriptを維持し、意味を変えない自然な日本語構文だけをElevenLabsへ送ります。</p></div><Link href="/admin/voice-preview/oman" className="btn">前回比較へ</Link></div>
    <section className="panel"><h2>正式Calibration Result</h2><p>「オマーンという国。」のみ自然。単語単体・文末・変革期・中東・1970年代文脈は不自然。</p><p className="hint">Production DB保存済み：{calibration.length}件（Voice A/B × 5 TEST）</p></section>
    <VoicePreviewClient options={[...VOICE_PREVIEW_OPTIONS]} tests={OMAN_CONTEXT_TESTS.map(({ id, label, displayScript, ttsInputText }) => ({ id, label, displayScript, ttsInputText }))} generationEnabled={process.env.ELEVENLABS_VOICE_PREVIEW_GENERATION_ENABLED === "true"} initialResults={initialResults} endpoint="/api/admin/voice-preview/oman-context" />
    <section className="panel"><h2>Human承認</h2><p>試聴後、自然さと字幕との意味同一性を満たした候補だけを承認してください。未承認候補は本番Pipelineへ適用されません。</p>{VOICE_PREVIEW_OPTIONS.map((voice) => <div key={voice.voiceId}><h3>{voice.label}</h3>{OMAN_CONTEXT_TESTS.filter((test) => test.kind === "context_candidate").map((test) => <div key={test.id} className="admin-table"><div><span><strong>{test.label}</strong><small>display：{test.displayScript}<br />TTS：{test.ttsInputText}</small></span><ContextRuleApproval displayPattern={test.displayScript} ttsTemplate={test.ttsInputText} voiceId={voice.voiceId} /></div></div>)}</div>)}</section>
  </main>;
}
