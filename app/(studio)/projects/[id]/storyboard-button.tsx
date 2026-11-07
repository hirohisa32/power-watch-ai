"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Action =
  "create_storyboard" | "review_storyboard" | "generate_scenes" | "render_final" | "view_final";

const ACTION_COPY: Record<Action, { label: string; pending: string; help: string; hash?: string }> =
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
    render_final: {
      label: "最終動画を作る",
      pending: "画面を開いています…",
      help: "ナレーション・BGM・Opening・Endingをまとめて完成動画を作成します。",
      hash: "final-render",
    },
    view_final: {
      label: "完成動画を見る",
      pending: "動画を開いています…",
      help: "完成動画を再生し、MP4をダウンロードできます。",
      hash: "completed-video",
    },
  };

export function StoryboardButton({ projectId, action }: { projectId: string; action: Action }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const copy = ACTION_COPY[action];

  function navigate() {
    setPending(true);
    const destination = `/projects/${projectId}/storyboard${copy.hash ? `#${copy.hash}` : ""}`;
    window.setTimeout(() => router.push(destination), 80);
  }

  async function generate() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/storyboard`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      router.push(`/projects/${projectId}/storyboard`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成できませんでした");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="action-stack project-primary-action">
      <button
        className="btn btn-primary"
        disabled={pending}
        onClick={action === "create_storyboard" ? generate : navigate}
      >
        {pending && <span className="button-spinner" aria-hidden="true" />}
        {pending ? copy.pending : copy.label}
      </button>
      <small>{copy.help}</small>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
