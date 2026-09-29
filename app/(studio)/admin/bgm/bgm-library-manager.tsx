"use client";

import { useRef, useState } from "react";

type Item = {
  id: string;
  key: string;
  name: string;
  filePath: string;
  durationMs: number;
  sampleRate: number;
  channels: number;
  genre: string;
  mood: string;
  tags: string[];
  suitableStyles: string[];
  active: boolean;
  provider: string | null;
  licenseType: string | null;
  licenseProof: string | null;
  acquiredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function BgmLibraryManager({ items: initial }: { items: Item[] }) {
  const [items, setItems] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function sync(files: FileList) {
    setSyncing(true);
    setMessage("");
    try {
      let completed = 0;
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/admin/bgm/sync", { method: "POST", body: form });
        const body = await response.json();
        if (!response.ok) throw new Error(`${file.name}: ${body.error || "同期できませんでした"}`);
        completed += 1;
        setMessage(`${completed} / ${files.length} 件をR2へ同期しました。`);
      }
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "同期できませんでした");
      setSyncing(false);
    }
  }

  function update(id: string, values: Partial<Item>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...values } : item));
  }

  async function save(item: Item) {
    setSaving(item.id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/bgm/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: item.name,
          genre: item.genre,
          mood: item.mood,
          tags: item.tags,
          suitableStyles: item.suitableStyles,
          active: item.active,
          provider: item.provider || null,
          licenseType: item.licenseType || null,
          licenseProof: item.licenseProof || null,
          acquiredAt: item.acquiredAt || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "保存できませんでした");
      setMessage(`${item.name} を保存しました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存できませんでした");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="bgm-library">
      <div className="panel bgm-import">
        <div><p className="eyebrow">R2正本</p><h2>承認済みBGMを同期</h2><p className="hint">system-assets/bgm/ の承認済み11ファイルだけを受け付けます。</p></div>
        <input ref={fileRef} hidden type="file" accept="audio/mpeg,.mp3" multiple onChange={(event) => event.target.files && void sync(event.target.files)} />
        <button className="btn btn-primary" disabled={syncing} onClick={() => fileRef.current?.click()}>{syncing ? "同期中…" : "11件を選択して同期"}</button>
      </div>
      {message && <p className="status-message" aria-live="polite">{message}</p>}
      {items.map((item) => (
        <article key={item.id} className="panel bgm-card">
          <div className="bgm-card-head">
            <div>
              <p className="eyebrow">{item.key}</p>
              <h2>{item.name}</h2>
              <p className="hint">{formatDuration(item.durationMs)} · {(item.sampleRate / 1000).toFixed(1)}kHz · {item.channels === 2 ? "Stereo" : `${item.channels}ch`}</p>
            </div>
            <label className="check-label"><input type="checkbox" checked={item.active} onChange={(event) => update(item.id, { active: event.target.checked })} />有効</label>
          </div>
          <audio controls preload="none" src={`/api/bgm/${item.id}/audio`} />
          <div className="field-grid bgm-fields">
            <Field label="表示名" value={item.name} onChange={(value) => update(item.id, { name: value })} />
            <Field label="ジャンル" value={item.genre} onChange={(value) => update(item.id, { genre: value })} />
            <Field label="ムード" value={item.mood} onChange={(value) => update(item.id, { mood: value })} />
            <Field label="タグ（カンマ区切り）" value={item.tags.join(", ")} onChange={(value) => update(item.id, { tags: split(value) })} />
            <Field label="推奨用途（カンマ区切り）" value={item.suitableStyles.join(", ")} onChange={(value) => update(item.id, { suitableStyles: split(value) })} />
            <Field label="Provider" value={item.provider ?? ""} onChange={(value) => update(item.id, { provider: value })} />
            <Field label="License" value={item.licenseType ?? ""} onChange={(value) => update(item.id, { licenseType: value })} />
            <Field label="取得日" type="date" value={item.acquiredAt?.slice(0, 10) ?? ""} onChange={(value) => update(item.id, { acquiredAt: value ? new Date(`${value}T00:00:00Z`).toISOString() : null })} />
            <label className="field field-full"><span>ライセンス証明</span><textarea value={item.licenseProof ?? ""} onChange={(event) => update(item.id, { licenseProof: event.target.value })} placeholder="証明書URL、注文番号、保管先など" /></label>
          </div>
          <div className="bgm-card-actions">
            <small>{item.filePath}</small>
            <button className="btn btn-primary" disabled={saving === item.id} onClick={() => save(item)}>{saving === item.id ? "保存中…" : "変更を保存"}</button>
          </div>
        </article>
      ))}
    </section>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="field"><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function split(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function formatDuration(durationMs: number) {
  const seconds = Math.round(durationMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
