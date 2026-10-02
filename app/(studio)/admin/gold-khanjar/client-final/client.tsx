"use client";
import { useState } from "react";

const scenes = ["01-oman-establishing", "02-qaboos-era", "03-diplomacy", "04-london-jeweller", "05-gift-preparation", "06-gift-delivery"];

export function HistoricalGenerator() {
  const [status, setStatus] = useState<Record<string, string>>({});
  async function run(scene: string) {
    setStatus((old) => ({ ...old, [scene]: "送信中" }));
    const response = await fetch("/api/admin/demo/gold-khanjar/client-final-historical", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scene }) });
    const body = await response.json();
    setStatus((old) => ({ ...old, [scene]: body.status ?? body.detail ?? body.error ?? `HTTP ${response.status}` }));
  }
  return <div className="admin-table">{scenes.map((scene) => <div key={scene}><span>{scene}<small>{status[scene] ?? "未確認"}</small></span><span><button className="btn btn-secondary" onClick={() => run(scene)}>生成／状態更新</button> <a className="btn btn-secondary" href={`/api/admin/demo/gold-khanjar/client-final-historical?scene=${scene}`} target="_blank" rel="noreferrer">Preview</a></span></div>)}</div>;
}
