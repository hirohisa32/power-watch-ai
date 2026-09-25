import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { ProjectCardActions } from "./project-card-actions";

export const metadata: Metadata = { title: "プロジェクト" };
export const dynamic = "force-dynamic";

const languageLabel = { ja: "日本語", en: "English", zh: "中文" } as const;
const statusLabel = {
  draft: "下書き",
  storyboard: "構成作成中",
  generating: "生成中",
  completed: "完成",
  failed: "要確認",
} as const;

export default async function ProjectsPage() {
  const user = await requireUser();
  const rows = await getDb()
    .select()
    .from(projects)
    .where(eq(projects.userId, user.id))
    .orderBy(desc(projects.updatedAt));
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <p className="eyebrow">Your productions</p>
          <h1>Projects</h1>
          <p className="lead">時計の物語を管理し、映像制作を開始します。</p>
        </div>
        <Link href="/projects/new" className="btn btn-primary">
          <Plus size={15} /> 新規プロジェクト
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="empty">
          <h2>最初の物語を始めましょう</h2>
          <p>台本と時計画像から、新しい映像プロジェクトを作成します。</p>
          <Link href="/projects/new" className="btn btn-primary">
            プロジェクトを作成
          </Link>
        </div>
      ) : (
        <div className="grid">
          {rows.map((project) => (
            <article className="project-card" key={project.id}>
              <Link href={`/projects/${project.id}`}>
                <div className="project-thumb" />
              </Link>
              <div className="project-body">
                <Link href={`/projects/${project.id}`}>
                  <h2 className="project-title">{project.title}</h2>
                </Link>
                <div className="meta-row">
                  <span className="pill">{statusLabel[project.status]}</span>
                  <span className="pill">{languageLabel[project.language]}</span>
                  <span className="pill">{project.targetDuration} SEC</span>
                </div>
                <p className="hint">
                  {new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(
                    project.createdAt,
                  )}
                </p>
                <ProjectCardActions id={project.id} />
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
