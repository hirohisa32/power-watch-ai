"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { SCENE_PRESETS, type ScenePresetName } from "@/lib/storyboard/presets";
import { friendlyError, GENERATION_STATUS_LABELS } from "@/lib/ui/presentation";
import { isFixedOpeningPreset } from "@/lib/opening/policy";

type EditorScene = {
  id: string;
  order: number;
  preset: ScenePresetName;
  title: string;
  duration: number;
  narration: string;
  narrationTone: string;
  dialogue: Array<{ speaker: string; text: string; tone: string }>;
  subtitle: string;
  visualDescription: string;
  visualPrompt: string;
  camera: string;
  shotType: string;
  lighting: string;
  motion: string;
  colorMood: string;
  transition: string;
  watchReference: boolean;
  preferredAssetLabels: string[];
  year: string | null;
  location: string | null;
  storyboardId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  selectedGenerationId: string | null;
};

type EditorGeneration = {
  id: string;
  projectId: string;
  sceneId: string;
  version: number;
  provider: string;
  model: string;
  status: "queued" | "generating" | "completed" | "failed" | "canceled";
  pipelineStage: string;
  prompt: string;
  regenerationInstruction: string | null;
  referenceAssetIds: string[];
  requestedDuration: number;
  outputObjectKey: string | null;
  estimatedCostCredits: number | null;
  estimatedCostUsd: number | null;
  actualCostCredits: number | null;
  actualCostUsd: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

const blankScene = (): Omit<
  EditorScene,
  "id" | "order" | "storyboardId" | "projectId" | "createdAt" | "updatedAt" | "selectedGenerationId"
> => ({
  preset: "HistoricalEvent",
  title: "New Scene",
  duration: 5,
  narration: "ナレーションを入力",
  narrationTone: "documentary",
  dialogue: [],
  subtitle: "字幕を入力",
  visualDescription: "物語の背景を補足する追加Scene",
  visualPrompt:
    "Cinematic historical event in an era-authentic environment, balanced editorial composition, 50mm lens feel, motivated natural lighting, restrained observational movement, muted period color palette",
  camera: SCENE_PRESETS.HistoricalEvent.camera,
  shotType: SCENE_PRESETS.HistoricalEvent.shotType,
  lighting: SCENE_PRESETS.HistoricalEvent.lighting,
  motion: SCENE_PRESETS.HistoricalEvent.motion,
  colorMood: SCENE_PRESETS.HistoricalEvent.colorMood,
  transition: SCENE_PRESETS.HistoricalEvent.transition,
  watchReference: false,
  preferredAssetLabels: [],
  year: null,
  location: null,
});

const QUICK_OPTIONS = [
  "もっと高級感を出す",
  "暗くする",
  "明るくする",
  "時計を大きくする",
  "カメラをゆっくり動かす",
  "人物を減らす",
  "時計を強調する",
  "動きを抑える",
];

const PIPELINE_STAGE_LABELS: Record<string, string> = {
  preparing: "準備中",
  image_creating: "画像を作成中",
  image_quality_gate: "画像を確認中",
  video_preparing: "映像を準備中",
  video_generating: "動画を生成中",
  saving: "保存中",
  completed: "完了",
  error: "エラー",
};

export function StoryboardEditor({
  projectId,
  targetDuration,
  hasCompletedRender,
  assetLabels,
  initialScenes,
  initialGenerations,
  showTechnical,
}: {
  projectId: string;
  targetDuration: number;
  hasCompletedRender: boolean;
  assetLabels: string[];
  initialScenes: EditorScene[];
  initialGenerations: EditorGeneration[];
  showTechnical: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<EditorScene | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(blankScene());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [regenerationInstructions, setRegenerationInstructions] = useState<Record<string, string>>(
    {},
  );
  const total = useMemo(
    () => initialScenes.reduce((sum, scene) => sum + scene.duration, 0),
    [initialScenes],
  );
  const bodySceneIds = new Set(
    initialScenes.filter((scene) => !isFixedOpeningPreset(scene.preset)).map((scene) => scene.id),
  );
  const hasActiveGeneration = initialGenerations.some(
    (generation) =>
      bodySceneIds.has(generation.sceneId) && ["queued", "generating"].includes(generation.status),
  );
  const completedGenerationIds = new Set(
    initialGenerations
      .filter((generation) => generation.status === "completed")
      .map((generation) => generation.id),
  );
  const completedSceneCount = initialScenes.filter(
    (scene) =>
      bodySceneIds.has(scene.id) &&
      Boolean(
        scene.selectedGenerationId && completedGenerationIds.has(scene.selectedGenerationId),
      ),
  ).length;
  const activeSceneCount = new Set(
    initialGenerations
      .filter(
        (generation) =>
          bodySceneIds.has(generation.sceneId) &&
          ["queued", "generating"].includes(generation.status),
      )
      .map((generation) => generation.sceneId),
  ).size;
  const activeGeneration = initialGenerations.find(
    (generation) =>
      bodySceneIds.has(generation.sceneId) && ["queued", "generating"].includes(generation.status),
  );
  const activeScene = activeGeneration
    ? initialScenes.find((scene) => scene.id === activeGeneration.sceneId)
    : null;
  const progressStartedAt = activeGeneration ? Date.parse(activeGeneration.createdAt) : null;
  const progressPercent = bodySceneIds.size
    ? Math.min(
        100,
        Math.round(((completedSceneCount + activeSceneCount * 0.45) / bodySceneIds.size) * 100),
      )
    : 0;
  useEffect(() => {
    if (!hasActiveGeneration) return;
    const timer = window.setTimeout(() => router.refresh(), 7_000);
    return () => window.clearTimeout(timer);
  }, [hasActiveGeneration, initialGenerations, router]);
  useEffect(() => {
    if (!progressStartedAt || !hasActiveGeneration) return;
    const timer = window.setInterval(
      () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - progressStartedAt) / 1_000))),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [hasActiveGeneration, pending, progressStartedAt]);
  useEffect(() => {
    if (!editing && !adding) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        setEditing(null);
        setAdding(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [adding, editing, pending]);
  async function request(
    url: string,
    options: RequestInit,
    feedback?: { started: string; completed?: (body: Record<string, unknown>) => string },
  ) {
    setPending(true);
    setError("");
    if (feedback) {
      setNotice(feedback.started);
    }
    try {
      const response = await fetch(url, options);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (feedback?.completed) setNotice(feedback.completed(body));
      setEditing(null);
      setAdding(false);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? friendlyError(cause.message)
          : "操作を完了できませんでした。もう一度お試しください。",
      );
    } finally {
      setPending(false);
    }
  }
  async function regenerate() {
    if (!window.confirm("現在の動画構成を残したまま、新しい構成を作成します。続けますか？")) return;
    await request(`/api/projects/${projectId}/storyboard`, { method: "POST" });
  }
  async function reconcileStoryBeats() {
    await request(
      `/api/projects/${projectId}/story-beats/reconcile`,
      { method: "POST" },
      {
        started: "ナレーション・映像・商品写真の一致を確認しています。",
        completed: (body) =>
          `Story Beat確認完了：PASS ${Number(body.pass ?? 0)}、要確認 ${Number(body.review ?? 0)}、NG ${Number(body.ng ?? 0)}`,
      },
    );
  }
  async function generateScene(
    scene: EditorScene,
    regenerateVideo = false,
    requestedInstruction?: string,
  ) {
    const instruction = regenerateVideo
      ? requestedInstruction?.trim() ||
        "前回の構図を改善し、主題を安定させ、自然で控えめなカメラ移動にしてください"
      : undefined;
    await request(
      `/api/projects/${projectId}/scenes/${scene.id}/generate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(instruction ? { instruction } : {}),
      },
      {
        started: `映像生成を開始しました。現在、シーン${scene.order}を生成しています。`,
        completed: () => `映像生成を受け付けました。シーン${scene.order}を生成しています。`,
      },
    );
  }
  return (
    <>
      <div className="storyboard-toolbar">
        <div>
          <span
            className={`duration-meter ${total === targetDuration || hasCompletedRender ? "valid" : "invalid"}`}
          >
            {hasCompletedRender ? `${total}秒 · 完成尺` : `${total} / ${targetDuration} 秒`}
          </span>
          <span className="hint">
            {completedSceneCount} / {bodySceneIds.size} 本編シーン完成 · Opening固定Master
            {activeSceneCount > 0 ? ` · ${activeSceneCount}シーンを生成中` : ""}
          </span>
        </div>
        <div className="nav-actions">
          <button
            className="btn"
            disabled={pending}
            onClick={() => {
              setDraft(blankScene());
              setAdding(true);
            }}
          >
            <Plus size={14} /> シーンを追加
          </button>
          <button className="btn" disabled={pending} onClick={regenerate}>
            <RefreshCw size={14} /> 動画構成を作り直す
          </button>
          <button className="btn" disabled={pending} onClick={reconcileStoryBeats}>
            Story Beatを再評価
          </button>
          <button
            className="btn btn-primary"
            disabled={pending || total !== targetDuration}
            onClick={() =>
              request(
                `/api/projects/${projectId}/generate-missing`,
                { method: "POST" },
                {
                  started: "映像生成を開始しています。対象シーンを確認中です。",
                  completed: (body) =>
                    `映像生成を開始しました。現在、${Number(body.queued ?? 0)}シーンを生成しています。`,
                },
              )
            }
          >
            {pending ? "生成中..." : "未生成シーンの映像を作る"}
          </button>
        </div>
      </div>
      {total !== targetDuration && !hasCompletedRender && (
        <p className="duration-warning">
          シーンの合計時間が動画の長さと一致していません。各シーンの秒数を調整してください。
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {(pending || hasActiveGeneration) && (
        <section className="generation-progress" role="status" aria-live="polite">
          <div>
            <span className="generation-progress-pulse" aria-hidden="true" />
            <div>
              <strong>映像を生成しています</strong>
              <p>{notice || `${activeSceneCount}シーンを生成しています。`}</p>
            </div>
          </div>
          <dl>
            <div>
              <dt>現在</dt>
              <dd>
                {activeGeneration
                  ? (PIPELINE_STAGE_LABELS[activeGeneration.pipelineStage] ?? "生成中")
                  : "受付中"}
              </dd>
            </div>
            <div>
              <dt>シーン</dt>
              <dd>
                {activeScene
                  ? `${activeScene.order} / ${bodySceneIds.size} · ${activeScene.title}`
                  : "準備中"}
              </dd>
            </div>
            <div>
              <dt>経過時間</dt>
              <dd>
                {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")}
              </dd>
            </div>
          </dl>
          <div className="generation-progress-track" aria-label={`全体進捗 ${progressPercent}%`}>
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        </section>
      )}
      <div className="scene-list" id="scene-list">
        {initialScenes.map((scene, index) => {
          const fixedOpening = isFixedOpeningPreset(scene.preset);
          const allGenerations = initialGenerations.filter(
            (generation) => generation.sceneId === scene.id,
          );
          const selectedGeneration = allGenerations.find(
            (generation) => generation.id === scene.selectedGenerationId,
          );
          const completedGeneration =
            selectedGeneration?.status === "completed" ? selectedGeneration : undefined;
          const generations = completedGeneration
            ? allGenerations.filter((generation) => generation.status !== "failed")
            : allGenerations;
          const activeGeneration = generations.find((generation) =>
            ["queued", "generating"].includes(generation.status),
          );
          return (
            <article className="scene-card" key={scene.id}>
              <div className="scene-number">
                <span>シーン</span>
                {String(scene.order).padStart(2, "0")}
              </div>
              <div className="scene-main">
                <div className="scene-heading">
                  <div>
                    <span className="pill">シーン {scene.order}</span>
                    <h2>{scene.title}</h2>
                  </div>
                  <span className="scene-duration">{scene.duration}s</span>
                </div>
                <div className="scene-copy">
                  <div>
                    <span>ナレーション</span>
                    <p>{scene.narration}</p>
                  </div>
                  <div>
                    <span>字幕</span>
                    <p>{scene.subtitle}</p>
                  </div>
                  <div>
                    <span>映像イメージ</span>
                    <p>{scene.visualDescription}</p>
                  </div>
                </div>
                <div className="scene-specs user-scene-specs">
                  <div>
                    <span>使用する時計画像</span>
                    {scene.watchReference
                      ? `使用${scene.preferredAssetLabels.length ? ` · ${scene.preferredAssetLabels.join(", ")}` : ""}`
                      : "なし"}
                  </div>
                  <div>
                    <span>年代・場所</span>
                    {[scene.year, scene.location].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div className="generation-panel">
                  <div className="generation-head">
                    <span>生成動画</span>
                    {fixedOpening ? (
                      <span className="generation-status completed">固定Master</span>
                    ) : activeGeneration ? (
                      <span className="generation-status active">
                        {GENERATION_STATUS_LABELS[activeGeneration.status]}
                      </span>
                    ) : completedGeneration ? (
                      <span className="generation-status completed">完了</span>
                    ) : generations[0]?.status === "failed" ? (
                      <span className="generation-status failed">要確認</span>
                    ) : (
                      <span className="generation-status">未生成</span>
                    )}
                  </div>
                  {generations.length > 0 && (
                    <div className="generation-versions">
                      {generations.map((generation) => (
                        <div className="generation-version" key={generation.id}>
                          <span>
                            バージョン {generation.version} ·{" "}
                            {GENERATION_STATUS_LABELS[generation.status]}
                            {showTechnical && generation.model ? ` · ${generation.model}` : ""}
                            {showTechnical && generation.actualCostUsd != null
                              ? ` · $${generation.actualCostUsd.toFixed(2)}`
                              : generation.estimatedCostUsd != null
                                ? ` · est. $${generation.estimatedCostUsd.toFixed(2)}`
                                : ""}
                          </span>
                          <div className="nav-actions">
                            {generation.status === "completed" && (
                              <a
                                className="btn"
                                href={`/api/generations/${generation.id}/video`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                動画を見る
                              </a>
                            )}
                            {generation.status === "completed" &&
                              scene.selectedGenerationId !== generation.id && (
                                <button
                                  className="btn"
                                  disabled={pending}
                                  onClick={() =>
                                    window.confirm("このバージョンを使用しますか？") &&
                                    request(
                                      `/api/projects/${projectId}/scenes/${scene.id}/generations/${generation.id}/select`,
                                      { method: "POST" },
                                    )
                                  }
                                >
                                  この動画を使用
                                </button>
                              )}
                            {scene.selectedGenerationId === generation.id && (
                              <span className="pill">使用中</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {generations[0]?.status === "failed" && (
                    <p className="error">
                      {generations[0].errorCode === "INSUFFICIENT_CREDITS" ||
                      generations[0].errorMessage?.toLowerCase().includes("enough credits")
                        ? "動画生成用の残高が不足しています。管理者へお問い合わせください。"
                        : "映像の生成に失敗しました。もう一度お試しください。"}
                    </p>
                  )}
                  <div className="card-actions">
                    {!fixedOpening && !completedGeneration && !activeGeneration && (
                      <button
                        className="btn btn-primary"
                        disabled={pending}
                        onClick={() => generateScene(scene, generations.length > 0)}
                      >
                        {generations.length > 0 ? "もう一度試す" : "映像を作る"}
                      </button>
                    )}
                    {!fixedOpening && completedGeneration && !activeGeneration && (
                      <button className="btn btn-secondary" onClick={() => setEditing(scene)}>
                        <WandSparkles size={14} /> 修正・再生成
                      </button>
                    )}
                  </div>
                </div>
                <div className="card-actions">
                  <button className="btn" onClick={() => setEditing(scene)}>
                    <Pencil size={13} /> 内容を修正
                  </button>
                  <button
                    className="btn"
                    disabled={pending || index === 0}
                    onClick={() =>
                      request(`/api/projects/${projectId}/scenes/${scene.id}/move`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ direction: "up" }),
                      })
                    }
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    className="btn"
                    disabled={pending || index === initialScenes.length - 1}
                    onClick={() =>
                      request(`/api/projects/${projectId}/scenes/${scene.id}/move`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ direction: "down" }),
                      })
                    }
                  >
                    <ChevronDown size={14} />
                  </button>
                  <button
                    className="btn btn-danger"
                    disabled={pending}
                    onClick={() =>
                      window.confirm(
                        `シーン ${scene.order}を削除しますか？この操作は取り消せません。`,
                      ) &&
                      request(`/api/projects/${projectId}/scenes/${scene.id}`, { method: "DELETE" })
                    }
                  >
                    <Trash2 size={13} /> 削除
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {(adding || editing) && (
        <div
          className="scene-drawer-backdrop"
          onMouseDown={() => !pending && (setAdding(false), setEditing(null))}
        >
          <aside
            className="scene-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scene-drawer-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="scene-drawer-head">
              <div>
                <p className="eyebrow">Scene editor</p>
                <h2 id="scene-drawer-title">
                  {adding ? "シーンを追加" : `シーン ${editing?.order} を編集`}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="編集画面を閉じる"
                disabled={pending}
                onClick={() => {
                  setAdding(false);
                  setEditing(null);
                }}
              >
                <X size={18} />
              </button>
            </header>
            <div className="scene-drawer-body">
              <SceneForm
                value={adding ? draft : editing!}
                assetLabels={assetLabels}
                pending={pending}
                onChange={(value) =>
                  adding ? setDraft(value) : setEditing({ ...editing!, ...value })
                }
                onCancel={() => {
                  setAdding(false);
                  setEditing(null);
                }}
                onSave={() =>
                  adding
                    ? request(`/api/projects/${projectId}/scenes`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(draft),
                      })
                    : request(`/api/projects/${projectId}/scenes/${editing!.id}`, {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(editing),
                      })
                }
              />
              {editing &&
                initialGenerations.some(
                  (generation) =>
                    generation.sceneId === editing.id && generation.status === "completed",
                ) && (
                  <section className="drawer-regenerate">
                    <div>
                      <p className="eyebrow">Quick actions</p>
                      <h3>映像の仕上がりを調整</h3>
                      <p className="hint">
                        選択した内容は修正指示へ反映されます。必要に応じて文章を追加してください。
                      </p>
                    </div>
                    <div className="quick-options" aria-label="修正候補">
                      {QUICK_OPTIONS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={
                            regenerationInstructions[editing.id] === option ? "selected" : ""
                          }
                          onClick={() =>
                            setRegenerationInstructions((current) => ({
                              ...current,
                              [editing.id]: option,
                            }))
                          }
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                    <label className="field">
                      <span>修正したい内容</span>
                      <textarea
                        className="drawer-instruction"
                        placeholder="例：照明を少し暗くし、カメラの動きをゆっくりにしてください"
                        value={regenerationInstructions[editing.id] ?? ""}
                        onChange={(event) =>
                          setRegenerationInstructions((current) => ({
                            ...current,
                            [editing.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      className="btn btn-primary"
                      disabled={pending}
                      onClick={() =>
                        generateScene(editing, true, regenerationInstructions[editing.id])
                      }
                    >
                      <RefreshCw size={14} /> このシーンだけ作り直す
                    </button>
                  </section>
                )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

type SceneDraft = ReturnType<typeof blankScene>;
function SceneForm({
  value,
  assetLabels,
  pending,
  onChange,
  onCancel,
  onSave,
}: {
  value: SceneDraft;
  assetLabels: string[];
  pending: boolean;
  onChange: (value: SceneDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof SceneDraft>(key: K, next: SceneDraft[K]) =>
    onChange({ ...value, [key]: next });
  return (
    <section className="scene-form">
      <div className="field-grid">
        <div className="field">
          <label>シーンの長さ（秒）</label>
          <input
            type="number"
            min={3}
            max={8}
            value={value.duration}
            onChange={(e) => set("duration", Number(e.target.value))}
          />
        </div>
        <TextField
          label="シーンタイトル"
          value={value.title}
          onChange={(v) => set("title", v)}
          full
        />
        <TextArea
          label="ナレーション"
          value={value.narration}
          onChange={(v) => set("narration", v)}
        />
        <TextArea label="字幕" value={value.subtitle} onChange={(v) => set("subtitle", v)} />
        <TextArea
          label="映像イメージ"
          value={value.visualDescription}
          onChange={(v) => set("visualDescription", v)}
        />
        <TextField label="年代" value={value.year ?? ""} onChange={(v) => set("year", v || null)} />
        <TextField
          label="場所"
          value={value.location ?? ""}
          onChange={(v) => set("location", v || null)}
        />
        <div className="field field-full">
          <label className="check-label">
            <input
              type="checkbox"
              checked={value.watchReference}
              onChange={(e) =>
                onChange({
                  ...value,
                  watchReference: e.target.checked,
                  preferredAssetLabels: e.target.checked ? value.preferredAssetLabels : [],
                })
              }
            />{" "}
            時計画像を使用
          </label>
          {value.watchReference && (
            <div className="asset-checks">
              {assetLabels.length ? (
                assetLabels.map((label) => (
                  <label className="check-label" key={label}>
                    <input
                      type="checkbox"
                      checked={value.preferredAssetLabels.includes(label)}
                      onChange={(e) =>
                        set(
                          "preferredAssetLabels",
                          e.target.checked
                            ? [...value.preferredAssetLabels, label]
                            : value.preferredAssetLabels.filter((item) => item !== label),
                        )
                      }
                    />{" "}
                    {label}
                  </label>
                ))
              ) : (
                <span className="hint">登録済み時計画像がありません。</span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="card-actions">
        <button className="btn btn-primary" disabled={pending} onClick={onSave}>
          保存
        </button>
        <button className="btn" disabled={pending} onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  full = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  full?: boolean;
}) {
  return (
    <div className={`field ${full ? "field-full" : ""}`}>
      <label>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field field-full">
      <label>{label}</label>
      <textarea
        className="compact-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
