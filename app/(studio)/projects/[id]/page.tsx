import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assets, projects } from "@/lib/db/schema";

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
  const styles = { cinematic_real: "Cinematic Real", animation: "Animation" } as const;
  const languages = { ja: "Japanese", en: "English", zh: "Chinese" } as const;
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <Link href="/projects" className="hint">
            <ArrowLeft size={12} /> プロジェクト一覧
          </Link>
          <p className="eyebrow">Project detail</p>
          <h1>{project.title}</h1>
        </div>
        <button className="btn btn-primary" disabled title="Phase 2で利用可能になります">
          Storyboardを作成
        </button>
      </div>
      <div className="detail-grid">
        <section className="panel">
          <h2>Script</h2>
          <p className="script-preview">{project.script}</p>
        </section>
        <aside>
          <section className="panel">
            <h2>Production</h2>
            <div className="key-value">
              <span>Style</span>
              <span>{styles[project.style]}</span>
            </div>
            <div className="key-value">
              <span>Language</span>
              <span>{languages[project.language]}</span>
            </div>
            <div className="key-value">
              <span>Target</span>
              <span>{project.targetDuration} sec</span>
            </div>
            <div className="key-value">
              <span>Status</span>
              <span>Draft</span>
            </div>
          </section>
          <section className="panel" style={{ marginTop: 18 }}>
            <h2>Watch Images</h2>
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
