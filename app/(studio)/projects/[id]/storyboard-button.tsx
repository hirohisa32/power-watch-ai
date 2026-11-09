"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Action =
  | "create_storyboard"
  | "review_storyboard"
  | "generate_scenes"
  | "wait_for_scenes"
  | "render_final"
  | "wait_for_render"
  | "view_final";

const ACTION_COPY: Record<
  Action,
  { label: string; pending: string; help: string; hash?: string; disabled?: boolean }
> =
  {
    create_storyboard: {
      label: "動画構成を作る",
      pending: "準備しています…",
      help: "台本をもとに、シーンごとの動画構成を作成します。",
    },
    review_storyboard: {
      label: "動画構成を確認する",
      pending: "画面を開いています…",
      help: "シーンごとの物語、映像内容、使用画像を確認します。",
    },
    generate_scenes: {
      label: "未生成シーンを作る",
      pending: "画面を開いています…",
      help: "画像をもとに各シーンを動画化します。完成まで数分かかる場合があります。",
      hash: "generate-scenes",
    },
    wait_for_scenes: {
      label: "シーンを生成しています…",
      pending: "シーンを生成しています…",
      help: "この画面を閉じても生成は続行されます。完了すると次の工程へ進めます。",
      disabled: true,
    },
    render_final: {
      label: "最終動画を作る",
      pending: "画面を開いています…",
      help: "ナレーション・BGM・Opening・Endingをまとめて完成動画を作成します。",
      hash: "final-render",
    },
    wait_for_render: {
      label: "最終動画を作成しています…",
      pending: "最終動画を作成しています…",
      help: "音声・字幕・映像を結合しています。完了後に再生・ダウンロードできます。",
      disabled: true,
    },
    view_final: {
      label: "完成動画を見る",
      pending: "動画を開いています…",
      help: "完成動画を再生し、MP4をダウンロードできます。",
      hash: "completed-video",
    },
  };

export function StoryboardButton({
  projectId,
  action,
  initialFailed = false,
}: {
  projectId: string;
  action: Action;
  initialFailed?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(
    initialFailed ? "動画構成の作成に失敗しました" : "",
  );
  const [failed, setFailed] = useState(initialFailed);
  const copy = ACTION_COPY[action];

  function navigate() {
    if (copy.disabled) return;
    setPending(true);
    const destination = `/projects/${projectId}/storyboard${copy.hash ? `#${copy.hash}` : ""}`;
    window.setTimeout(() => router.push(destination), 80);
  }

  async function generate() {
    setPending(true);
    setError("");
    setFailed(false);
    try {
      const response = await fetch(`/api/projects/${projectId}/storyboard`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      router.push(`/projects/${projectId}/storyboard`);
      router.refresh();
    } catch (cause) {
      setFailed(true);
      setError(cause instanceof Error ? cause.message : "動画構成の作成に失敗しました");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="action-stack project-primary-action">
      <button
        className="btn btn-primary"
        disabled={pending || copy.disabled}
        onClick={action === "create_storyboard" ? generate : navigate}
      >
        {pending && <span className="button-spinner" aria-hidden="true" />}
        {pending ? copy.pending : failed ? "もう一度試す" : copy.label}
      </button>
      <small>{copy.help}</small>
      {error && (
        <div className="storyboard-error" role="alert">
          <strong>{error}</strong>
          <span>入力内容は保存されています。</span>
        </div>
      )}
    </div>
  );
}
