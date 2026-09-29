import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assets, finalRenders, projects, storyboards } from "@/lib/db/schema";
import { LANGUAGE_LABELS, PROJECT_STATUS_LABELS, STYLE_LABELS, projectProgress } from "@/lib/ui/presentation";
import { StoryboardButton } from "./storyboard-button";

export const metadata: Metadata = { title: "プロジェクト詳細" };
export const dynamic = "force-dynamic";

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
    .limit(1);
  if (!project) notFound();
  const images = await db.select().from(assets).where(eq(assets.projectId, project.id));
  const [activeStoryboard] = await db
    .select({ id: storyboards.id })
    .from(storyboards)
    .where(and(eq(storyboards.projectId, project.id), eq(storyboards.isActive, true)))
    .limit(1);
  const [completedRender] = await db.select({ id: finalRenders.id, width: finalRenders.width, height: finalRenders.height, durationMs: finalRenders.durationMs }).from(finalRenders).where(and(eq(finalRenders.projectId, id), eq(finalRenders.status, "completed"))).limit(1);
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <Link href="/projects" className="hint">
            <ArrowLeft size={12} /> 動画一覧
          </Link>
          <p className="eyebrow">動画の詳細</p>
          <h1>{project.title}</h1>
        </div>
        <StoryboardButton projectId={project.id} exists={Boolean(activeStoryboard)} />
      </div>
      <div className="production-progress"><div><strong>{PROJECT_STATUS_LABELS[project.status]}</strong><span>{projectProgress(project.status)}%</span></div><div className="progress-track"><span style={{ width: `${projectProgress(project.status)}%` }} /></div><p>{project.status === "completed" ? "動画が完成しました" : activeStoryboard ? "動画構成を確認し、映像の作成へ進めます。" : "台本と時計画像を確認し、動画構成を作成してください。"}</p></div>
      {completedRender && <section className="completed-callout"><div><p className="eyebrow">完成動画</p><h2>動画が完成しました</h2><p>{completedRender.durationMs ? `${(completedRender.durationMs / 1000).toFixed(0)}秒 · ` : ""}{completedRender.width}×{completedRender.height}</p></div><div className="card-actions"><a className="btn" href={`/api/renders/${completedRender.id}/video`} target="_blank">動画を見る</a><a className="btn btn-primary" href={`/api/renders/${completedRender.id}/download`}>MP4をダウンロード</a></div></section>}
      <div className="detail-grid">
        <section className="panel">
          <h2>台本</h2>
          <p className="script-preview">{project.script}</p>
        </section>
        <aside>
          <section className="panel">
            <h2>動画設定</h2>
            <div className="key-value">
              <span>動画スタイル</span>
              <span>{STYLE_LABELS[project.style]}</span>
            </div>
            <div className="key-value">
              <span>言語</span>
              <span>{LANGUAGE_LABELS[project.language]}</span>
            </div>
            <div className="key-value">
              <span>動画の長さ</span>
              <span>{project.targetDuration}秒</span>
            </div>
            <div className="key-value">
              <span>状態</span>
              <span>{PROJECT_STATUS_LABELS[project.status]}</span>
            </div>
          </section>
          <section className="panel" style={{ marginTop: 18 }}>
            <h2>時計画像</h2>
            {images.length === 0 ? (
              <p className="hint">画像は登録されていません。</p>
            ) : (
              <div className="asset-list">
                {images.map((asset) => (
                  <div className="asset" key={asset.id}>
                    <a href={`/api/assets/${asset.id}`} target="_blank" rel="noreferrer">
                      {asset.label}
                    </a>
                    <div className="hint">{(asset.sizeBytes / 1024 / 1024).toFixed(1)} MB</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
