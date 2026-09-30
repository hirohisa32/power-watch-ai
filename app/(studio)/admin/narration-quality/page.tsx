import type { Metadata } from "next";
import Link from "next/link";
import { desc, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { japaneseReadingDictionary } from "@/lib/db/schema";
import { latestNarrationQualityRuns, narrationQualitySegmentsForRuns } from "@/lib/audio/quality-repository";
import { isAdminEmail } from "@/lib/ui/presentation";
import { DictionaryForm } from "./dictionary-form";

export const metadata: Metadata = { title: "日本語Narration品質" };
export const dynamic = "force-dynamic";

export default async function NarrationQualityPage() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  const [dictionary, runs] = await Promise.all([
    getDb().select().from(japaneseReadingDictionary).where(isNull(japaneseReadingDictionary.projectId)).orderBy(desc(japaneseReadingDictionary.updatedAt)),
    latestNarrationQualityRuns(),
  ]);
  const segments = await narrationQualitySegmentsForRuns(runs.map((run) => run.id));
  return <main className="content">
    <div className="page-head"><div><p className="eyebrow">管理者専用</p><h1>日本語Narration Quality Gate</h1><p className="lead">問題のある意味Segmentだけを特定し、最大2回Retry後に必要箇所のみHumanへ渡します。</p></div><Link href="/admin" className="btn">管理トップへ</Link></div>
    <section className="panel admin-section"><h2>自動処理</h2><p>Script → 発音辞書 → 1〜2文分割 → ElevenLabs → 自動文字起こし → 発音・自然さ判定 → Segment Retry → PASS音声結合 → 全文再検査</p><div className="admin-summary"><div><span>PASS基準</span><strong>Accuracy 96%以上</strong></div><div><span>自動Retry</span><strong>最大2回</strong></div><div><span>低信頼判定</span><strong>Human Review</strong></div></div></section>
    <section className="panel admin-section"><h2>承認済みJapanese Reading Dictionary</h2><DictionaryForm /><div className="admin-table">{dictionary.map((entry) => <div key={entry.id}><span><strong>{entry.display}</strong><small>{entry.source === "system" ? "システム共通" : "Human承認"}</small></span><span>{entry.reading}</span></div>)}</div></section>
    <section className="panel admin-section"><h2>品質検査履歴</h2>{runs.map((run) => <article key={run.id} className="panel"><p><strong>{run.status}</strong> · {run.segmentCount} Segment · Voice {run.voiceId}</p>{segments.filter((segment) => segment.runId === run.id).map((segment) => <div key={segment.id} className="admin-table"><div><span>Segment {String(segment.segmentIndex + 1).padStart(2, "0")} · {segment.status}{segment.retryCount ? ` · Retry ${segment.retryCount}回` : ""}<small>{segment.reasons.join(" / ") || "問題なし"}</small></span><span>{segment.durationSeconds ? `${segment.durationSeconds.toFixed(2)}秒` : "—"}</span></div>{segment.normalizedObjectKey && <audio controls preload="metadata" src={`/api/admin/narration-quality/audio?segmentId=${segment.id}`} />}</div>)}</article>)}{runs.length === 0 && <p className="empty-state">本番Quality Gateはまだ実行していません。</p>}</section>
  </main>;
}
