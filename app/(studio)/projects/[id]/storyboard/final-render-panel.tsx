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
          <p className="eyebrow">FINAL COMPOSITION</p>
          <h2>1080 × 1920 Final MP4</h2>
          <p className="hint">
            選択済みSceneを順番に結合し、ElevenLabs Narration・字幕・BGM・SEをMixします。
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
          <button className="btn btn-primary" type="submit" disabled={pending || active}>
            {active ? <RefreshCw size={14} /> : <Film size={14} />}
            {active ? "Rendering…" : completed ? "Re-render" : "Final Render"}
          </button>
        </form>
      </div>
      {error && <p className="error">{error}</p>}
      {renders.length > 0 && (
        <div className="render-history">
          {renders.map((render) => (
            <div className="render-row" key={render.id}>
              <span>
                v{render.version} · {render.status} · {render.width}×{render.height} · {render.fps}
                fps
                {render.durationMs != null ? ` · ${(render.durationMs / 1000).toFixed(1)}s` : ""}
                {render.estimatedCost > 0 ? ` · $${render.estimatedCost.toFixed(6)}` : ""}
              </span>
              {render.status === "failed" && (
                <span className="error">
                  {render.errorCode}: {render.errorMessage}
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
              Preview
            </a>
            <a className="btn btn-primary" href={`/api/renders/${completed.id}/download`}>
              <Download size={14} /> Download MP4
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
