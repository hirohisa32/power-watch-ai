import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assets, bgmAssets, projects, systemVideoAssets } from "@/lib/db/schema";
import {
  LANGUAGE_LABELS,
  STYLE_LABELS,
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
import { ProjectSubnav } from "./project-subnav";
import { HAYASHI_VOICE } from "@/lib/system-media/config";

export const metadata: Metadata = { title: "プロジェクト詳細" };
export const dynamic = "force-dynamic";

export default async function ProjectDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { id } = await params;
  const { section } = await searchParams;
  const user = await requireUser();
  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
    .limit(1);
  if (!project) notFound();
  const images = await db.select().from(assets).where(eq(assets.projectId, project.id));
  const [activeStoryboard, generations, renders, mediaAssets, selectedBgm] = await Promise.all([
    getActiveStoryboard(id),
    listSceneGenerations(id),
    listProjectRenders(id),
    db.select().from(systemVideoAssets),
    db.select().from(bgmAssets).where(eq(bgmAssets.key, project.bgmKey)).limit(1),
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
  const openingAsset = mediaAssets.find((asset) => asset.id === project.openingAssetId);
  const endingAsset = mediaAssets.find((asset) => asset.id === project.endingAssetId);
  return (
    <main className="content project-detail-page">
      <div className="page-head project-page-head">
        <div>
          <Link href="/projects" className="hint">
            <ArrowLeft size={12} /> 動画一覧
          </Link>
          <p className="eyebrow">動画の詳細</p>
          <h1>{project.title}</h1>
        </div>
        <StoryboardButton projectId={project.id} action={workflow.action} />
      </div>
      <ProjectSubnav
        projectId={project.id}
        active={section === "settings" ? "settings" : "overview"}
        hasCompletedVideo={workflow.phase === "COMPLETED"}
      />
      <ProjectStepper
        currentStep={workflow.currentStep}
        processing={workflow.phase === "SCENES_GENERATING" || workflow.phase === "FINAL_RENDERING"}
      />
      <div className={`production-progress phase-${workflow.phase.toLowerCase()}`}>
        <div>
          <strong>現在：{workflow.label}</strong>
          <span>{workflow.progress}%</span>
        </div>
        <div className="progress-track">
          <span style={{ width: `${workflow.progress}%` }} />
        </div>
        <p>{workflow.description}</p>
      </div>
      {workflow.phase === "COMPLETED" && completedRender && (
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
            <a
              className="btn btn-primary"
              href={`/api/renders/${completedRender.id}/video`}
              target="_blank"
            >
              完成動画を見る
            </a>
            <a className="btn btn-secondary" href={`/api/renders/${completedRender.id}/download`}>
              MP4をダウンロード
            </a>
          </div>
        </section>
      )}
      <div className="detail-grid">
        <section className="panel" id="project-script">
          <h2>台本</h2>
          <p className="script-preview">{project.script}</p>
        </section>
        <aside>
          <section className="panel" id="project-settings">
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
              <span>Opening</span>
              <span>{openingAsset?.displayName ?? "なし"}</span>
            </div>
            <div className="key-value">
              <span>Ending</span>
              <span>{endingAsset?.displayName ?? "なし"}</span>
            </div>
            <div className="key-value">
              <span>BGM</span>
              <span>{selectedBgm[0]?.name ?? project.bgmKey}</span>
            </div>
            <div className="key-value">
              <span>ナレーション</span>
              <span>
                {project.narratorVoiceId === HAYASHI_VOICE.voiceId
                  ? HAYASHI_VOICE.name
                  : project.narratorVoiceId
                    ? "選択済みナレーター"
                    : "自動選択"}
              </span>
            </div>
            <div className="key-value">
              <span>字幕</span>
              <span>{project.narrationSubtitlesEnabled ? "表示する" : "表示しない"}</span>
            </div>
            <div className="key-value">
              <span>状態</span>
              <span>{workflow.label}</span>
            </div>
            <p className="settings-regeneration-note">
              設定を変更すると、該当シーンまたは最終動画の作り直しが必要になる場合があります。
            </p>
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
