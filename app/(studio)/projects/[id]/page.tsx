import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assets, projects } from "@/lib/db/schema";
import {
  LANGUAGE_LABELS,
  PROJECT_STATUS_LABELS,
  STYLE_LABELS,
  projectProgress,
} from "@/lib/ui/presentation";
import { StoryboardButton } from "./storyboard-button";
import { ProjectStepper } from "./project-stepper";
import { AssetMetadataManager } from "./asset-metadata-manager";
import {
  hasRoleMismatch,
  roleReviewStatus,
  roleSuggestions,
  WATCH_ROLE_LABELS,
} from "@/lib/assets/role-detection";
import { getActiveStoryboard } from "@/lib/storyboard/repository";
import { listSceneGenerations } from "@/lib/video/repository";
import { listProjectRenders } from "@/lib/render/repository";
import { isFixedOpeningPreset } from "@/lib/opening/policy";
import { projectWorkflow } from "@/lib/ui/project-workflow";

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
  const [activeStoryboard, generations, renders] = await Promise.all([
    getActiveStoryboard(id),
    listSceneGenerations(id),
    listProjectRenders(id),
  ]);
  const bodyScenes =
    activeStoryboard?.scenes.filter((scene) => !isFixedOpeningPreset(scene.preset)) ?? [];
  const bodySceneIds = new Set(bodyScenes.map((scene) => scene.id));
  const bodyGenerations = generations.filter((generation) => bodySceneIds.has(generation.sceneId));
  const completedIds = new Set(
    bodyGenerations
      .filter((generation) => generation.status === "completed")
      .map((generation) => generation.id),
  );
  const completedScenes = bodyScenes.filter(
    (scene) => scene.selectedGenerationId && completedIds.has(scene.selectedGenerationId),
  ).length;
  const workflow = projectWorkflow({
    hasStoryboard: Boolean(activeStoryboard),
    hasAnySceneGeneration: bodyGenerations.length > 0,
    totalScenes: bodyScenes.length,
    completedScenes,
    hasActiveSceneGeneration: bodyGenerations.some((generation) =>
      ["queued", "generating"].includes(generation.status),
    ),
    hasActiveRender: renders.some((render) => ["queued", "rendering"].includes(render.status)),
    hasCompletedRender: renders.some((render) => render.status === "completed"),
  });
  const completedRender = renders.find((render) => render.status === "completed");
  const buttonAction =
    workflow.action === "wait_for_render"
      ? ("render_final" as const)
      : workflow.action === "wait_for_scenes"
        ? ("generate_scenes" as const)
        : workflow.action;
  return (
    <main className="content">
      <div className="page-head project-page-head">
        <div>
          <Link href="/projects" className="hint">
            <ArrowLeft size={12} /> 動画一覧
          </Link>
          <p className="eyebrow">動画の詳細</p>
          <h1>{project.title}</h1>
        </div>
        <StoryboardButton projectId={project.id} action={buttonAction} />
      </div>
      <ProjectStepper
        currentStep={workflow.currentStep}
        processing={["wait_for_scenes", "wait_for_render"].includes(workflow.action)}
      />
      <div className="production-progress">
        <div>
          <strong>{PROJECT_STATUS_LABELS[project.status]}</strong>
          <span>{projectProgress(project.status)}%</span>
        </div>
        <div className="progress-track">
          <span style={{ width: `${projectProgress(project.status)}%` }} />
        </div>
        <p>
          {project.status === "completed"
            ? "動画が完成しました"
            : activeStoryboard
              ? "動画構成を確認し、映像の作成へ進めます。"
              : "台本と時計画像を確認し、動画構成を作成してください。"}
        </p>
      </div>
      {completedRender && (
        <section className="completed-callout" id="completed-video">
          <div>
            <p className="eyebrow">完成動画</p>
            <h2>動画が完成しました</h2>
            <p>
              {completedRender.durationMs
                ? `${(completedRender.durationMs / 1000).toFixed(0)}秒 · `
                : ""}
              {completedRender.width}×{completedRender.height}
            </p>
          </div>
          <div className="card-actions">
            <a className="btn" href={`/api/renders/${completedRender.id}/video`} target="_blank">
              動画を見る
            </a>
            <a className="btn btn-secondary" href={`/api/renders/${completedRender.id}/download`}>
              MP4をダウンロード
            </a>
          </div>
        </section>
      )}
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
              <AssetMetadataManager
                projectId={project.id}
                initialAssets={images.map((asset) => ({
                  id: asset.id,
                  label: asset.label,
                  humanLabel: asset.humanLabel ?? asset.label,
                  suggestions: roleSuggestions(asset).map((suggestion) => ({
                    role: suggestion.role,
                    label: WATCH_ROLE_LABELS[suggestion.role],
                    confidence: suggestion.confidence,
                    featureGatePassed: suggestion.featureGatePassed,
                  })),
                  reviewStatus: roleReviewStatus(asset),
                  mismatch: hasRoleMismatch(asset),
                  humanLocked: asset.humanLocked,
                  lockedRole: asset.role,
                }))}
                roleOptions={Object.entries(WATCH_ROLE_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
