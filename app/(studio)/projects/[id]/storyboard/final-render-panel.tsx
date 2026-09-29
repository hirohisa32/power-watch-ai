"use client";

import { Download, Film, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
}: {
  projectId: string;
  renders: RenderSummary[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const active = renders.some((render) => ["queued", "rendering"].includes(render.status));
  const completed = useMemo(
    () => renders.find((render) => render.status === "completed"),
    [renders],
  );
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
      if (!response.ok) throw new Error(body.error || "Final Renderを開始できませんでした");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Final Renderを開始できませんでした");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="final-render-panel">
      <div className="final-render-head">
        <div>
          <p className="eyebrow">完成動画</p>
          <h2>1080 × 1920 縦型MP4</h2>
          <p className="hint">Sceneを順番に結合し、ナレーション・字幕・BGM・効果音を仕上げます。</p>
        </div>
        <form
          action={`/api/projects/${projectId}/renders`}
          method="post"
          onSubmit={(event) => {
            event.preventDefault();
            void startRender();
          }}
        >
          <button className="btn btn-primary" type="submit" disabled={pending || active}>
            {active ? <RefreshCw size={14} /> : <Film size={14} />}
            {active ? "完成動画を作成中…" : completed ? "完成動画を再作成" : "完成動画を作成"}
          </button>
        </form>
      </div>
      {error && <p className="error">{error}</p>}
      {visibleRenders.length > 0 && (
        <div className="render-history">
          {visibleRenders.map((render) => (
            <div className="render-row" key={render.id}>
              <span>
                バージョン {render.version} · {statusLabel[render.status]} · {render.width}×
                {render.height} · {render.fps}fps
                {render.durationMs != null ? ` · ${(render.durationMs / 1000).toFixed(1)}秒` : ""}
              </span>
              {render.status === "failed" && (
                <span className="error">
                  {render.errorMessage ||
                    "完成動画を作成できませんでした。もう一度お試しください。"}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {completed && (
        <div className="final-preview">
          <video
            controls
            playsInline
            preload="metadata"
            src={`/api/renders/${completed.id}/video`}
          />
          <div className="nav-actions">
            <a className="btn" href={`/api/renders/${completed.id}/video`} target="_blank">
              大きく見る
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
