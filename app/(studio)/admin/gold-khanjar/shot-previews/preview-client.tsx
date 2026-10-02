"use client";

import { useCallback, useEffect, useState } from "react";

type ShotId = "shot-1" | "shot-4";
type Result = {
  status: string;
  model?: string;
  durationSeconds?: number;
  estimatedCredits?: number;
  actualCredits?: number;
  progress?: number;
  failure?: string;
  previewUrl?: string;
  rawDownloadUrl?: string;
  error?: string;
};

export function ShotPreviewClient({ shot, title, description }: { shot: ShotId; title: string; description: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  const check = useCallback(async () => {
    const response = await fetch("/api/admin/demo/gold-khanjar/shot-previews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shot }),
    });
    const body = (await response.json()) as Result;
    setResult(body);
    if (!response.ok && body.status !== "failed") throw new Error(body.error ?? "Preview生成に失敗しました");
    return body;
  }, [shot]);

  async function start() {
    if (started) return;
    setStarted(true);
    setBusy(true);
    try {
      const next = await check();
      if (next.status === "completed" || next.status === "failed") setBusy(false);
    } catch (error) {
      setResult({ status: "error", error: error instanceof Error ? error.message : "生成に失敗しました" });
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!busy || !result || !["submitted", "pending", "running"].includes(result.status)) return;
    const timer = window.setTimeout(async () => {
      try {
        const next = await check();
        if (next.status === "completed" || next.status === "failed") setBusy(false);
      } catch (error) {
        setResult({ status: "error", error: error instanceof Error ? error.message : "状態確認に失敗しました" });
        setBusy(false);
      }
    }, 6500);
    return () => window.clearTimeout(timer);
  }, [busy, check, result]);

  const completed = result?.status === "completed";
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Runway Gen‑4.5 · 5秒 · 最大60 credits</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <button className="btn" type="button" onClick={start} disabled={busy || started}>
          {busy ? "同一Taskを確認中…" : "承認済み1生成を開始"}
        </button>
      </div>
      {result ? (
        <p className="hint">
          Status: {result.status}
          {typeof result.progress === "number" ? ` · ${Math.round(result.progress * 100)}%` : ""}
          {result.actualCredits != null ? ` · ${result.actualCredits} credits` : result.estimatedCredits != null ? ` · 推定${result.estimatedCredits} credits` : ""}
          {result.error ? ` · ${result.error}` : ""}
          {result.failure ? ` · ${result.failure}` : ""}
        </p>
      ) : null}
      {completed ? (
        <div>
          <video key={result.previewUrl} controls playsInline preload="metadata" style={{ width: "min(100%, 480px)", borderRadius: 18 }}>
            <source src={result.previewUrl} type="video/mp4" />
          </video>
          <p><a className="btn btn-secondary" href={result.rawDownloadUrl}>Runway原本をダウンロード</a></p>
        </div>
      ) : null}
    </section>
  );
}
