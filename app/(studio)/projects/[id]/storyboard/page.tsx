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
import { listProjectRenders } from "@/lib/render/repository";
import { isAdminEmail } from "@/lib/ui/presentation";
import { FinalRenderPanel } from "./final-render-panel";
import { StoryboardEditor } from "./storyboard-editor";

export const metadata: Metadata = { title: "動画構成" };
export const dynamic = "force-dynamic";

export default async function StoryboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const isAdmin = isAdminEmail(user.email);
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
  const [generations, renders] = await Promise.all([
    listSceneGenerations(id),
    listProjectRenders(id),
  ]);
  return (
    <main className="content storyboard-page">
      <div className="page-head">
        <div>
          <Link href={`/projects/${id}`} className="hint">
            <ArrowLeft size={12} /> プロジェクト詳細
          </Link>
          <p className="eyebrow">動画構成 · バージョン {active.storyboard.version}</p>
          <h1>{project.title}</h1>
          <p className="lead">
            シーンごとの映像、ナレーション、字幕を確認し、気になる部分だけ修正できます。
          </p>
        </div>
      </div>
      <StoryboardEditor
        projectId={id}
        targetDuration={project.targetDuration}
        hasCompletedRender={renders.some((render) => render.status === "completed")}
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
        showTechnical={isAdmin}
      />
      <FinalRenderPanel
        projectId={id}
        renders={renders.map((render) => ({
          id: render.id,
          version: render.version,
          status: render.status,
          width: render.width,
          height: render.height,
          fps: render.fps,
          durationMs: render.durationMs,
          estimatedCost: render.estimatedCost,
          errorCode: render.errorCode,
          errorMessage: render.errorMessage,
          createdAt: render.createdAt.toISOString(),
        }))}
        showTechnical={isAdmin}
      />
    </main>
  );
}
