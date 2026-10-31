"use client";

import { useRef, useState } from "react";

type Scene = { id: string; status: string; reused: boolean; credits: number; previewUrl?: string | null; failure?: string };
type State = { scenes?: Scene[]; narrationReady?: boolean; allCompleted?: boolean; productsReady?: boolean; storyBodyReady?: boolean; productBodyReady?: boolean; openingReady?: boolean; endingReady?: boolean; render?: Render; error?: string; detail?: string };
type Render = { renderId: string; status: string; previewUrl: string; downloadUrl: string; duration?: number; opening?: string | null; ending?: string | null };

export function GoldKhanjarFullClient() {
  const endingFile = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({});
  const [busy, setBusy] = useState(false);
  async function call(action: "start" | "poll" | "prepare-products" | "prepare-story-body" | "prepare-product-body" | "prepare-opening" | "prepare-ending" | "render") {
    setBusy(true);
    const response = await fetch("/api/admin/demo/gold-khanjar/full", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    const body = await response.json();
    setState((old) => ({ ...old, ...body, ...(action === "render" && body.previewUrl ? { render: body } : {}) }));
    setBusy(false);
  }
  async function uploadEnding(file: File) {
    setBusy(true);
    const form = new FormData(); form.append("file", file);
    const response = await fetch("/api/admin/demo/gold-khanjar/ending-cache", { method: "POST", body: form });
    const body = await response.json();
    setState((old) => ({ ...old, ...body }));
    setBusy(false);
  }
  const render = state.render;
  return <>
    <section className="panel"><input ref={endingFile} hidden type="file" accept="video/mp4" onChange={(event) => event.target.files?.[0] && void uploadEnding(event.target.files[0])} /><div className="button-row"><button className="btn btn-primary" disabled={busy} onClick={() => call("start")}>残りScene生成</button><button className="btn btn-secondary" disabled={busy} onClick={() => call("poll")}>状態更新</button><button className="btn btn-secondary" disabled={busy || !state.allCompleted || state.productsReady} onClick={() => call("prepare-products")}>{state.productsReady ? "Product Motion準備済み" : "Product Motion準備"}</button><button className="btn btn-secondary" disabled={busy || !state.productsReady || state.storyBodyReady} onClick={() => call("prepare-story-body")}>{state.storyBodyReady ? "本編前半準備済み" : "本編前半準備"}</button><button className="btn btn-secondary" disabled={busy || !state.productsReady || state.productBodyReady} onClick={() => call("prepare-product-body")}>{state.productBodyReady ? "本編後半準備済み" : "本編後半準備"}</button><button className="btn btn-secondary" disabled={busy || state.openingReady} onClick={() => call("prepare-opening")}>{state.openingReady ? "Opening準備済み" : "Opening準備"}</button><button className="btn btn-secondary" disabled={busy || state.endingReady} onClick={() => call("prepare-ending")}>{state.endingReady ? "Ending準備済み" : "Ending準備"}</button><button className="btn btn-secondary" disabled={busy || state.endingReady} onClick={() => endingFile.current?.click()}>Ending Cache登録</button><button className="btn btn-primary" disabled={busy || !state.allCompleted || !state.storyBodyReady || !state.productBodyReady || !state.openingReady || !state.endingReady} onClick={() => call("render")}>Final Render</button></div>{state.error && <p className="error-text">{state.error} {state.detail}</p>}</section>
    <section className="panel"><h2>Story Scene</h2><div className="admin-table">{(state.scenes ?? []).map((scene) => <div key={scene.id}><span>{scene.id}<small>{scene.reused ? "承認済み素材を再利用" : `${scene.credits} credits`} · {scene.status}</small></span><span>{scene.previewUrl && <a className="btn btn-secondary" href={scene.previewUrl} target="_blank">Preview</a>}</span></div>)}</div></section>
    {render && <section className="panel"><h2>完成版</h2><p>{render.duration?.toFixed(2)}秒 · Opening: {render.opening ?? "なし"} · Ending: {render.ending ?? "なし"}</p><div className="button-row"><a className="btn btn-primary" href={render.previewUrl} target="_blank">Production Preview</a><a className="btn btn-secondary" href={render.downloadUrl}>MP4 Download</a></div></section>}
  </>;
}

