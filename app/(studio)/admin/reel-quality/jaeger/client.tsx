"use client";

import { useCallback, useEffect, useState } from "react";

type State = {
  prepared: boolean;
  allIncludedReady: boolean;
  subtitlesEnabled: boolean;
  storyQualityStatus: string | null;
  storyQuality: Record<string, number | string>;
  missingSceneIds: string[];
  scenes: Array<{
    id: string;
    order: number;
    title: string;
    included: boolean;
    storyPhase: string | null;
    generationStatus: string | null;
    model: string | null;
  }>;
  renders: Array<{
    id: string;
    version: number;
    status: string;
    durationMs: number | null;
    errorCode: string | null;
  }>;
};

export default function JaegerReelClient() {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/reel-quality/jaeger", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "状態を取得できません");
    setState(body);
    return body as State;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/reel-quality/jaeger", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "状態を取得できません");
        setState(body);
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") setMessage(error.message);
      });
    return () => controller.abort();
  }, []);

  async function prepare() {
    setBusy(true);
    setMessage("再編集プランを適用中…");
    try {
      const response = await fetch("/api/admin/reel-quality/jaeger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "prepare" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "適用に失敗しました");
      setState(body);
      setMessage("再編集プランを適用しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "適用に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="panel">
        <div className="button-row">
          <button className="btn btn-primary" disabled={busy} onClick={prepare}>
            5章Reel再編集を適用
          </button>
          <button className="btn" disabled={busy} onClick={() => refresh()}>
            状態更新
          </button>
        </div>
        {message && <p>{message}</p>}
        {state && (
          <div className="admin-table">
            <div>
              <span>適用状態</span>
              <strong>{state.prepared ? "PASS" : "未適用"}</strong>
            </div>
            <div>
              <span>Narration字幕</span>
              <strong>{state.subtitlesEnabled ? "ON" : "OFF"}</strong>
            </div>
            <div>
              <span>Story Quality</span>
              <strong>
                {state.storyQualityStatus ?? "未評価"} / {String(state.storyQuality.average ?? "—")}
              </strong>
            </div>
            <div>
              <span>Purchase Desire</span>
              <strong>{String(state.storyQuality.purchaseDesire ?? "—")}</strong>
            </div>
            <div>
              <span>Final対象映像</span>
              <strong>
                {state.allIncludedReady ? "PASS" : `${state.missingSceneIds.length}件未完了`}
              </strong>
            </div>
          </div>
        )}
      </section>
      {state && (
        <section className="panel admin-section">
          <h2>Final対象Scene</h2>
          {state.scenes.map((scene) => (
            <div className="admin-table" key={scene.id}>
              <div>
                <span>
                  {scene.included ? `#${scene.order}` : "Final除外"} · {scene.title}
                  <small>
                    {scene.storyPhase ?? "—"} · {scene.model ?? "未生成"}
                  </small>
                </span>
                <strong>{scene.included ? (scene.generationStatus ?? "未生成") : "除外"}</strong>
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
