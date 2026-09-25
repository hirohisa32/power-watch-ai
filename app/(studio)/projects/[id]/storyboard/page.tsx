import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assets, projects } from "@/lib/db/schema";
import { getActiveStoryboard } from "@/lib/storyboard/repository";
import { listSceneGenerations } from "@/lib/video/repository";
import { StoryboardEditor } from "./storyboard-editor";

export const metadata: Metadata = { title: "Storyboard" };
export const dynamic = "force-dynamic";

export default async function StoryboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
    .limit(1);
  if (!project) notFound();
  const active = await getActiveStoryboard(id);
  if (!active) notFound();
  const watchAssets = await db
    .select({ label: assets.label })
    .from(assets)
    .where(eq(assets.projectId, id));
  const generations = await listSceneGenerations(id);
  return (
    <main className="content storyboard-page">
      <div className="page-head">
        <div>
          <Link href={`/projects/${id}`} className="hint">
            <ArrowLeft size={12} /> プロジェクト詳細
          </Link>
          <p className="eyebrow">Storyboard · Version {active.storyboard.version}</p>
          <h1>{project.title}</h1>
          <p className="lead">
            動画生成前に、構成・ナレーション・映像指示をScene単位で確認してください。
          </p>
        </div>
      </div>
      <StoryboardEditor
        projectId={id}
        targetDuration={project.targetDuration}
        assetLabels={watchAssets.map((asset) => asset.label)}
        initialScenes={active.scenes.map((scene) => ({
          ...scene,
          createdAt: scene.createdAt.toISOString(),
          updatedAt: scene.updatedAt.toISOString(),
        }))}
        initialGenerations={generations.map((generation) => ({
          ...generation,
          createdAt: generation.createdAt.toISOString(),
          updatedAt: generation.updatedAt.toISOString(),
          completedAt: generation.completedAt?.toISOString() ?? null,
        }))}
      />
    </main>
  );
}
