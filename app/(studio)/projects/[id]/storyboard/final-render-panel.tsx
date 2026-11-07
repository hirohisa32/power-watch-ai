"use client";

import { Check, Download, Film } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { friendlyError } from "@/lib/ui/presentation";

type RenderSummary = {
  id: string;
  version: number;
  status: "queued" | "rendering" | "completed" | "failed";
  width: number;
  height: number;
  fps: number;
  durationMs: number | null;
  estimatedCost: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export function FinalRenderPanel({
  projectId,
  renders,
  showTechnical,
}: {
  projectId: string;
  renders: RenderSummary[];
  showTechnical: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const completed = useMemo(
    () => renders.find((render) => render.status === "completed"),
    [renders],
  );
  const active =
    !completed && renders.some((render) => ["queued", "rendering"].includes(render.status));
  const visibleRenders = completed
    ? renders.filter((render) => render.status === "completed")
    : renders;
  const statusLabel: Record<RenderSummary["status"], string> = {
    queued: "開始待ち",
    rendering: "音声・字幕・映像を結合中",
    completed: "完成",
    failed: "要確認",
  };
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => router.refresh(), 6_000);
    return () => window.clearTimeout(timer);
  }, [active, renders, router]);

  async function startRender() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/renders`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "最終動画を作成できませんでした");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? friendlyError(cause.message)
          : "最終動画を作成できませんでした。もう一度お試しください。",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="final-render-panel" id="final-render">
      <div className="final-render-head">
        <div>
          <p className="eyebrow">最終動画</p>
          <h2>{completed ? "動画が完成しました" : "完成動画を作る"}</h2>
          <p className="hint">
            選択中のシーンを順番につなぎ、ナレーション・字幕・音楽を仕上げます。
          </p>
        </div>
        <form
          action={`/api/projects/${projectId}/renders`}
          method="post"
          onSubmit={(event) => {
            event.preventDefault();
            void startRender();
          }}
        >
          <button
            className={`btn ${completed ? "btn-secondary" : "btn-primary"}`}
            type="submit"
            disabled={pending || active}
          >
            {pending || active ? (
              <span className="button-spinner" aria-hidden="true" />
            ) : (
              <Film size={14} />
            )}
            {pending
              ? "作成を開始しています…"
              : active
                ? "最終動画を仕上げています…"
                : completed
                  ? "最終動画を作り直す"
                  : "最終動画を作る"}
          </button>
        </form>
      </div>
      {error && (
        <div className="error action-feedback" role="alert">
          <strong>最終動画を作成できませんでした</strong>
          <span>{error}</span>
          <span>完成済みシーンは保持されています。内容を確認して、もう一度お試しください。</span>
        </div>
      )}
      {(pending || active) && (
        <div className="render-progress" role="status" aria-live="polite">
          <span className="loading-bar" />
          <strong>{pending ? "最終動画の準備中" : "音声・字幕・映像を結合しています"}</strong>
          <small>この画面を閉じても作成は続行されます。</small>
        </div>
      )}
      {completed && (
        <p className="success-feedback">
          <Check size={14} /> 最終動画が完成しました
        </p>
      )}
      {visibleRenders.length > 0 && (showTechnical || !completed) && (
        <div className="render-history">
          {visibleRenders.map((render) => (
            <div className="render-row" key={render.id}>
              <span>
                バージョン {render.version} · {statusLabel[render.status]} · {render.width}×
                {render.height} · {render.fps}fps
                {render.durationMs != null ? ` · ${(render.durationMs / 1000).toFixed(1)}秒` : ""}
              </span>
              {render.status === "failed" && (
                <span className="error">{friendlyError(render.errorMessage)}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {completed && (
        <div className="final-preview" id="completed-video">
          <video
            controls
            playsInline
            preload="metadata"
            src={`/api/renders/${completed.id}/video`}
          />
          <div className="nav-actions">
            <a className="btn" href="#scene-list">
              このシーンを修正
            </a>
            <a className="btn" href={`/projects/${projectId}?section=settings#project-settings`}>
              設定を確認
            </a>
            <a className="btn btn-primary" href={`/api/renders/${completed.id}/download`}>
              <Download size={14} /> MP4をダウンロード
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
