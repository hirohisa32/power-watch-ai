"use client";

import { Download, DoorOpen, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Preview = {
  id: string;
  status: "queued" | "generating" | "rendering" | "completed" | "failed";
  stage: string;
  durationMs: number;
  assetLabel: string;
  masterVersion: number;
  masterStatus: string;
  runwayCredits: number;
  runwayCostUsd: number;
  elevenlabsCostUsd: number;
  audioMetrics: Record<string, unknown>;
  errorMessage: string | null;
};

export function OpeningPreviewPanel({ projectId, previews }: { projectId: string; previews: Preview[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const active = previews.some((item) => ["queued", "generating", "rendering"].includes(item.status));
  const latest = previews[0];
  const completed = useMemo(() => previews.find((item) => item.status === "completed"), [previews]);
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => router.refresh(), 7_000);
    return () => window.clearTimeout(timer);
  }, [active, previews, router]);

  async function start() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/opening-previews`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Opening Previewを開始できませんでした");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Opening Previewを開始できませんでした");
    } finally {
      setPending(false);
    }
  }

  const stage: Record<string, string> = {
    master: "固定Opening Templateを読込中",
    watch: "実物時計を差し替え中",
    "watch-replace": "固定モーションへ実物時計を合成中",
    "audio-and-render": "固定Audio Masterを合成中",
    completed: "Human確認待ち",
  };
  return (
    <section className="final-render-panel">
      <div className="final-render-head">
        <div>
          <p className="eyebrow">POWER WATCH · Fixed Brand Opening</p>
          <h2>Opening Master確認用Preview</h2>
          <p className="hint">
            扉・古書室・机・ランプ・本・埃・風を固定化し、実物時計部分だけをProjectごとに差し替えます。
            85秒本編は作り直しません。
          </p>
        </div>
        <form
          action={`/api/projects/${projectId}/opening-previews`}
          method="post"
          onSubmit={(event) => {
            event.preventDefault();
            void start();
          }}
        >
          <button className="btn btn-primary" type="submit" disabled={pending || active}>
            {active ? <RefreshCw size={14} /> : <DoorOpen size={14} />}
            {active ? "Openingを制作中…" : completed ? "新しい時計で試作" : "15秒Previewを作成"}
          </button>
        </form>
      </div>
      {error && <p className="error">{error}</p>}
      {latest && (
        <div className="render-history">
          <div className="render-row">
            <span>
              Master v{latest.masterVersion} · {stage[latest.stage] || latest.stage} · 使用時計: {latest.assetLabel}
            </span>
            {latest.status === "failed" && <span className="error">{latest.errorMessage || "Opening制作に失敗しました"}</span>}
          </div>
        </div>
      )}
      {completed && (
        <div className="final-preview">
          <video controls playsInline preload="metadata" src={`/api/opening-previews/${completed.id}/video`} />
          <p className="hint">
            {(completed.durationMs / 1000).toFixed(1)}秒 · Fixed Opening Template · Runway {completed.runwayCredits.toFixed(0)} credits · AAC stereo
          </p>
          <div className="nav-actions">
            <a className="btn" href={`/api/opening-previews/${completed.id}/video`} target="_blank">大きく見る</a>
            <a className="btn btn-primary" href={`/api/opening-previews/${completed.id}/download`}>
              <Download size={14} /> Preview MP4をダウンロード
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
