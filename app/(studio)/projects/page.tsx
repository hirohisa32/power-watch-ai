import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listUserProjects } from "@/lib/ui/project-list";
import { PROJECT_STATUS_LABELS } from "@/lib/ui/presentation";
import { ProjectCollection } from "./project-collection";

export const metadata: Metadata = { title: "ホーム" };
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await requireUser();
  const rows = await listUserProjects(user.id);
  const counts: Record<string, number> = Object.fromEntries(Object.keys(PROJECT_STATUS_LABELS).map((key) => [key, 0]));
  rows.forEach((project) => counts[project.status]++);
  return (
    <main className="content">
      <div className="hero-panel">
        <div><p className="eyebrow">POWER WATCH</p><h1>次の時計物語を<br />映像にしましょう。</h1><p className="lead">台本と時計画像を用意すれば、動画構成から完成動画まで順番に進められます。</p></div>
        <Link href="/projects/new" className="btn btn-primary btn-large"><Plus size={18} />新しい動画を作る</Link>
      </div>
      <section className="summary-grid" aria-label="動画の集計">
        <div><strong>{counts.draft}</strong><span>下書き</span></div>
        <div><strong>{counts.storyboard + counts.generating}</strong><span>制作中</span></div>
        <div><strong>{counts.completed}</strong><span>完成</span></div>
      </section>
      <div className="section-head"><div><p className="eyebrow">最近の動画</p><h2>制作を続ける</h2></div><Link href="/videos" className="text-link">すべて見る</Link></div>
      {rows.length ? <ProjectCollection rows={rows.slice(0, 6)} /> : <div className="empty"><h2>まだ動画がありません。</h2><p>最初の時計物語を作成しましょう。</p><Link href="/projects/new" className="btn btn-primary">最初の動画を作る</Link></div>}
    </main>
  );
}
