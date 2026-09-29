import type { Metadata } from "next";
import { desc, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiUsage, projects, renderJobs, videoGenerations } from "@/lib/db/schema";
import { isAdminEmail } from "@/lib/ui/presentation";

export const metadata: Metadata = { title: "管理" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  const db = getDb();
  const [usage, generations, jobs, [projectCount]] = await Promise.all([
    db.select().from(apiUsage).orderBy(desc(apiUsage.createdAt)).limit(100),
    db.select().from(videoGenerations).orderBy(desc(videoGenerations.createdAt)).limit(50),
    db.select().from(renderJobs).orderBy(desc(renderJobs.createdAt)).limit(50),
    db.select({ value: sql<number>`count(*)` }).from(projects),
  ]);
  const providerTotals = usage.reduce<Record<string, number>>((all, row) => { all[row.provider] = (all[row.provider] ?? 0) + (row.estimatedCost ?? 0); return all; }, {});
  const total = Object.values(providerTotals).reduce((sum, value) => sum + value, 0) + generations.reduce((sum, row) => sum + (row.actualCostUsd ?? row.estimatedCostUsd ?? 0), 0);
  return <main className="content">
    <div className="page-head"><div><p className="eyebrow">管理者専用</p><h1>運用状況</h1><p className="lead">API利用量、生成実費、処理状況、エラーを確認できます。</p></div></div>
    <section className="admin-summary"><div><span>動画数</span><strong>{projectCount.value}</strong></div><div><span>記録済み生成実費</span><strong>${total.toFixed(2)}</strong></div><div><span>処理中Job</span><strong>{jobs.filter((job) => ["queued", "processing"].includes(job.status)).length}</strong></div><div><span>要確認</span><strong>{jobs.filter((job) => job.status === "failed").length + generations.filter((item) => item.status === "failed").length}</strong></div></section>
    <section className="panel admin-section"><h2>サービス別利用実費</h2><div className="admin-table">{Object.entries(providerTotals).map(([provider, amount]) => <div key={provider}><span>{provider}</span><span>${amount.toFixed(4)}</span></div>)}</div></section>
    <section className="panel admin-section"><h2>映像生成履歴</h2><div className="admin-table">{generations.map((item) => <div key={item.id}><span>{item.provider} / {item.model} / v{item.version}</span><span>{item.status}{item.errorCode ? ` · ${item.errorCode}` : ""}</span></div>)}</div></section>
    <section className="panel admin-section"><h2>最終動画Job</h2><div className="admin-table">{jobs.map((job) => <div key={job.id}><span>{job.id}</span><span>{job.status}{job.errorCode ? ` · ${job.errorCode}` : ""}</span></div>)}</div></section>
  </main>;
}
