"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { PRESET_NAMES, SCENE_PRESETS, type ScenePresetName } from "@/lib/storyboard/presets";

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

export function StoryboardEditor({
  projectId,
  targetDuration,
  assetLabels,
  initialScenes,
  initialGenerations,
}: {
  projectId: string;
  targetDuration: number;
  assetLabels: string[];
  initialScenes: EditorScene[];
  initialGenerations: EditorGeneration[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<EditorScene | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(blankScene());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [regenerationInstructions, setRegenerationInstructions] = useState<Record<string, string>>(
    {},
  );
  const total = useMemo(
    () => initialScenes.reduce((sum, scene) => sum + scene.duration, 0),
    [initialScenes],
  );
  const hasActiveGeneration = initialGenerations.some((generation) =>
    ["queued", "generating"].includes(generation.status),
  );
  const completedSceneCount = new Set(
    initialGenerations
      .filter((generation) => generation.status === "completed")
      .map((generation) => generation.sceneId),
  ).size;
  const activeSceneCount = new Set(
    initialGenerations
      .filter((generation) => ["queued", "generating"].includes(generation.status))
      .map((generation) => generation.sceneId),
  ).size;
  useEffect(() => {
    if (!hasActiveGeneration) return;
    const timer = window.setTimeout(() => router.refresh(), 7_000);
    return () => window.clearTimeout(timer);
  }, [hasActiveGeneration, initialGenerations, router]);
  async function request(url: string, options: RequestInit) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(url, options);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setEditing(null);
      setAdding(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作を完了できませんでした");
    } finally {
      setPending(false);
    }
  }
  async function regenerate() {
    if (!window.confirm("現在のStoryboardを保持したまま、新しいVersionを生成して置き換えますか？"))
      return;
    await request(`/api/projects/${projectId}/storyboard`, { method: "POST" });
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
    await request(`/api/projects/${projectId}/scenes/${scene.id}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(instruction ? { instruction } : {}),
    });
  }
  return (
    <>
      <div className="storyboard-toolbar">
        <div>
          <span className={`duration-meter ${total === targetDuration ? "valid" : "invalid"}`}>
            {total} / {targetDuration} 秒
          </span>
          <span className="hint">
            {completedSceneCount} / {initialScenes.length} Scene 完了
            {activeSceneCount > 0 ? ` · ${activeSceneCount} Sceneを生成中` : ""}
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
            <Plus size={14} /> Scene追加
          </button>
          <button className="btn" disabled={pending} onClick={regenerate}>
            <RefreshCw size={14} /> 全再生成
          </button>
          <button
            className="btn btn-primary"
            disabled={pending || total !== targetDuration}
            onClick={() =>
              request(`/api/projects/${projectId}/generate-missing`, { method: "POST" })
            }
          >
            未生成Sceneを一括生成
          </button>
        </div>
      </div>
      {total !== targetDuration && (
        <p className="duration-warning">
          Scene合計が目標尺と一致していません。生成前にDurationを調整してください。
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {adding && (
        <SceneForm
          value={draft}
          assetLabels={assetLabels}
          pending={pending}
          onChange={setDraft}
          onCancel={() => setAdding(false)}
          onSave={() =>
            request(`/api/projects/${projectId}/scenes`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(draft),
            })
          }
        />
      )}
      <div className="scene-list">
        {initialScenes.map((scene, index) => {
          const generations = initialGenerations.filter(
            (generation) => generation.sceneId === scene.id,
          );
          const activeGeneration = generations.find((generation) =>
            ["queued", "generating"].includes(generation.status),
          );
          const completedGeneration = generations.find(
            (generation) => generation.status === "completed",
          );
          return editing?.id === scene.id ? (
            <SceneForm
              key={scene.id}
              value={editing}
              assetLabels={assetLabels}
              pending={pending}
              onChange={(value) => setEditing({ ...editing, ...value })}
              onCancel={() => setEditing(null)}
              onSave={() =>
                request(`/api/projects/${projectId}/scenes/${scene.id}`, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(editing),
                })
              }
            />
          ) : (
            <article className="scene-card" key={scene.id}>
              <div className="scene-number">
                <span>SCENE</span>
                {String(scene.order).padStart(2, "0")}
              </div>
              <div className="scene-main">
                <div className="scene-heading">
                  <div>
                    <span className="pill">{scene.preset}</span>
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
                <div className="scene-specs">
                  <div>
                    <span>カメラ</span>
                    {scene.camera}
                  </div>
                  <div>
                    <span>ライティング</span>
                    {scene.lighting}
                  </div>
                  <div>
                    <span>時計画像の参照</span>
                    {scene.watchReference
                      ? `使用${scene.preferredAssetLabels.length ? ` · ${scene.preferredAssetLabels.join(", ")}` : ""}`
                      : "なし"}
                  </div>
                  <div>
                    <span>年代 / 場所</span>
                    {[scene.year, scene.location].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div className="generation-panel">
                  <div className="generation-head">
                    <span>生成動画</span>
                    {activeGeneration ? (
                      <span className="generation-status active">
                        {activeGeneration.status === "queued" ? "開始待ち" : "生成中"}
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
                            v{generation.version} · {generation.model} · {generation.status}
                            {generation.actualCostUsd != null
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
                        ? "Runway creditsが不足しています。管理者へ追加を依頼してください。"
                        : "動画生成に失敗しました。指示を調整して再生成してください。"}
                    </p>
                  )}
                  <div className="card-actions">
                    {!completedGeneration && !activeGeneration && (
                      <button
                        className="btn btn-primary"
                        disabled={pending}
                        onClick={() => generateScene(scene, generations.length > 0)}
                      >
                        {generations.length > 0 ? "もう一度生成" : "動画を生成"}
                      </button>
                    )}
                    {completedGeneration && !activeGeneration && (
                      <>
                        <input
                          aria-label={`Scene ${scene.order} 再生成の修正指示`}
                          className="regeneration-instruction"
                          placeholder="修正したい点（例：時計の形を固定、動きをゆっくり）"
                          value={regenerationInstructions[scene.id] ?? ""}
                          onChange={(event) =>
                            setRegenerationInstructions((current) => ({
                              ...current,
                              [scene.id]: event.target.value,
                            }))
                          }
                        />
                        <button
                          className="btn"
                          disabled={pending}
                          onClick={() =>
                            generateScene(scene, true, regenerationInstructions[scene.id])
                          }
                        >
                          このSceneを再生成
                        </button>
                      </>
                    )}
                    <button
                      className="btn"
                      disabled={pending || Boolean(activeGeneration)}
                      onClick={() => setEditing(scene)}
                    >
                      映像設定
                    </button>
                  </div>
                </div>
                <div className="card-actions">
                  <button className="btn" onClick={() => setEditing(scene)}>
                    <Pencil size={13} /> Scene編集
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
                      window.confirm(`Scene ${scene.order}を削除しますか？`) &&
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
  function presetChanged(preset: ScenePresetName) {
    const base = SCENE_PRESETS[preset];
    const referenceRequired = ["WatchReveal", "WristShot", "WatchMacro", "ProductHero"].includes(
      preset,
    );
    onChange({
      ...value,
      preset,
      camera: base.camera,
      shotType: base.shotType,
      lighting: base.lighting,
      motion: base.motion,
      colorMood: base.colorMood,
      transition: base.transition,
      watchReference: referenceRequired ? true : value.watchReference,
      preferredAssetLabels:
        referenceRequired && value.preferredAssetLabels.length === 0 && assetLabels[0]
          ? [assetLabels[0]]
          : value.preferredAssetLabels,
    });
  }
  return (
    <section className="scene-form">
      <div className="field-grid">
        <div className="field">
          <label>Preset</label>
          <select
            value={value.preset}
            onChange={(e) => presetChanged(e.target.value as ScenePresetName)}
          >
            {PRESET_NAMES.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Duration</label>
          <input
            type="number"
            min={3}
            max={8}
            value={value.duration}
            onChange={(e) => set("duration", Number(e.target.value))}
          />
        </div>
        <TextField label="Title" value={value.title} onChange={(v) => set("title", v)} full />
        <TextArea label="Narration" value={value.narration} onChange={(v) => set("narration", v)} />
        <TextArea label="Subtitle" value={value.subtitle} onChange={(v) => set("subtitle", v)} />
        <TextArea
          label="Visual Summary"
          value={value.visualDescription}
          onChange={(v) => set("visualDescription", v)}
        />
        <TextArea
          label="Visual Prompt"
          value={value.visualPrompt}
          onChange={(v) => set("visualPrompt", v)}
        />
        <TextField label="Camera" value={value.camera} onChange={(v) => set("camera", v)} />
        <TextField label="Shot Type" value={value.shotType} onChange={(v) => set("shotType", v)} />
        <TextField label="Lighting" value={value.lighting} onChange={(v) => set("lighting", v)} />
        <TextField label="Motion" value={value.motion} onChange={(v) => set("motion", v)} />
        <TextField
          label="Color Mood"
          value={value.colorMood}
          onChange={(v) => set("colorMood", v)}
        />
        <TextField
          label="Transition"
          value={value.transition}
          onChange={(v) => set("transition", v)}
        />
        <TextField label="Year" value={value.year ?? ""} onChange={(v) => set("year", v || null)} />
        <TextField
          label="Location"
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
            時計Referenceを使用
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
