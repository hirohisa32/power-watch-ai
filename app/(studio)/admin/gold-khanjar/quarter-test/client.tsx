"use client";
import { useState } from "react";

type Scene = { id: string; status?: string; actualCredits?: number; estimatedCredits?: number; previewUrl?: string | null };
type State = { scenes?: Scene[]; allCompleted?: boolean; narrationReady?: boolean; render?: { previewUrl: string; downloadUrl: string } | null; error?: string; detail?: string };

export function QuarterTestClient() {
  const [state, setState] = useState<State>({}); const [busy, setBusy] = useState(false);
  async function call(action: "start" | "poll" | "render") { setBusy(true); const response = await fetch("/api/admin/demo/gold-khanjar/quarter-test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }); const body = await response.json(); setState((old) => ({ ...old, ...body, ...(action === "render" && body.previewUrl ? { render: body } : {}) })); setBusy(false); return body as State; }
  return <>
    <section className="panel"><h2>制作</h2><p>生成は各Scene 1回。Quality Gate NG時の再生成はこの画面では自動実行しません。</p><p><button className="btn" disabled={busy} onClick={() => call("start")}>Narration 1回＋Runway 3 Sceneを開始</button> <button className="btn btn-secondary" disabled={busy} onClick={() => call("poll")}>生成状態を更新</button> <button className="btn btn-secondary" disabled={busy || !state.allCompleted} onClick={() => call("render")}>1/4 Test MP4をRender</button></p>{(state.error || state.detail) && <p className="error-banner">{state.detail ?? state.error}</p>}</section>
    <section className="panel"><h2>Quality Gate素材</h2><div className="admin-table">{(state.scenes ?? []).map((scene) => <div key={scene.id}><span>{scene.id}<small>{scene.status ?? "未生成"} · {scene.actualCredits ?? scene.estimatedCredits ?? 0} credits</small></span><span>{scene.status === "completed" && <a className="btn btn-secondary" href={`/api/admin/demo/gold-khanjar/quarter-test?scene=${scene.id}`} target="_blank">Preview</a>}</span></div>)}<div><span>Mr Kenji Hayashi Narration</span><span>{state.narrationReady ? <a className="btn btn-secondary" href="/api/admin/demo/gold-khanjar/quarter-test?asset=narration" target="_blank">試聴</a> : "未生成"}</span></div></div></section>
    {state.render && <section className="panel"><h2>完成した1/4 Test</h2><p><a className="btn" href={state.render.previewUrl} target="_blank">Production Preview</a> <a className="btn btn-secondary" href={state.render.downloadUrl}>MP4 Download</a></p><video controls playsInline style={{ width: "min(100%, 360px)", borderRadius: 16 }} src={state.render.previewUrl} /></section>}
  </>;
}
