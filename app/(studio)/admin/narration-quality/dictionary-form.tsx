"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DictionaryForm() {
  const router = useRouter();
  const [display, setDisplay] = useState("");
  const [reading, setReading] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/japanese-reading-dictionary", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ display, reading }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "保存できませんでした");
      setDisplay("");
      setReading("");
      setMessage(body.updated ? "承認済み読みを更新しました。" : "承認済み読みを追加しました。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存できませんでした");
    } finally {
      setSaving(false);
    }
  }

  return <div className="form-grid">
    <label>表示語<input value={display} onChange={(event) => setDisplay(event.target.value)} placeholder="例：変革期" /></label>
    <label>読み<input value={reading} onChange={(event) => setReading(event.target.value)} placeholder="例：へんかくき" /></label>
    <button className="btn btn-primary" disabled={saving || !display.trim() || !reading.trim()} onClick={() => void save()}>{saving ? "保存中…" : "承認済み辞書へ追加"}</button>
    {message && <p className="status-message" aria-live="polite">{message}</p>}
  </div>;
}
