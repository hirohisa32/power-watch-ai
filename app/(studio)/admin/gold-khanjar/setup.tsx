"use client";

import { useRef, useState } from "react";

export function GoldKhanjarSetup() {
  const [projectId, setProjectId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function initialize() {
    setBusy(true);
    const response = await fetch("/api/admin/demo/gold-khanjar/init", { method: "POST" });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(body.error || "初期化できませんでした");
    setProjectId(body.projectId);
    setMessage(body.existing ? "既存Projectを再利用します。" : "Projectを初期化しました。");
  }

  async function upload(files: FileList) {
    if (!projectId) return setMessage("先にProjectを初期化してください。");
    setBusy(true);
    let completed = 0;
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("projectId", projectId);
        form.append("file", file);
        const response = await fetch("/api/admin/demo/gold-khanjar/upload", { method: "POST", body: form });
        const body = await response.json();
        if (!response.ok) throw new Error(`${file.name}: ${body.error || "登録失敗"}`);
        completed += 1;
        setMessage(`${completed} / ${files.length} 件を登録しました。`);
      }
      setMessage(`${completed}件の承認済み素材を登録しました。Project: ${projectId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登録できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="button-row">
        <button className="btn btn-primary" disabled={busy} onClick={() => void initialize()}>1. Project初期化</button>
        <input ref={fileRef} hidden type="file" accept="image/jpeg,video/mp4" multiple onChange={(event) => event.target.files && void upload(event.target.files)} />
        <button className="btn btn-secondary" disabled={busy || !projectId} onClick={() => fileRef.current?.click()}>2. 17素材を登録</button>
        <form action="/api/admin/demo/gold-khanjar/narration" method="post">
          <button className="btn btn-secondary" disabled={busy} type="submit">Voice Aで本番Narrationを1回生成</button>
        </form>
      </div>
      <p className="hint">画像7枚＋scene-11.mp4〜scene-20.mp4のみ受け付けます。</p>
      {message && <p className="status-message" aria-live="polite">{message}</p>}
      {projectId && <a className="btn btn-secondary" href={`/projects/${projectId}/storyboard`}>動画構成を開く</a>}
      <a className="btn btn-secondary" href="/api/admin/demo/gold-khanjar/narration" target="_blank" rel="noreferrer">本番Narrationを試聴</a>
    </section>
  );
}
