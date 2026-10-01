"use client";

import { useState } from "react";

type Option = { id: string; label: string; voiceId: string; model: "eleven_multilingual_v2" | "eleven_v4" };
type Result = { rawAudioUrl?: string; normalizedAudioUrl?: string; message?: string; loading?: boolean; characterCost?: number; durationSeconds?: number };

export function ModelComparisonClient({ options, generationEnabled, initialResults }: { options: Option[]; generationEnabled: boolean; initialResults: Record<string, Result> }) {
  const [results, setResults] = useState(initialResults);
  async function generate(option: Option) {
    setResults((current) => ({ ...current, [option.id]: { loading: true } }));
    try {
      const response = await fetch("/api/admin/voice-preview/model-comparison", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voiceId: option.voiceId, model: option.model }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "生成できませんでした");
      setResults((current) => ({ ...current, [option.id]: { rawAudioUrl: `${body.rawAudioUrl}&t=${Date.now()}`, normalizedAudioUrl: `${body.normalizedAudioUrl}&t=${Date.now()}`, message: body.reused ? "R2保存済み音声を再利用しました。" : "ElevenLabsで1回生成し、R2へ保存しました。", characterCost: body.characterCost, durationSeconds: body.durationSeconds } }));
    } catch (error) {
      setResults((current) => ({ ...current, [option.id]: { message: error instanceof Error ? error.message : "生成に失敗しました" } }));
    }
  }
  return <section className="card-grid">{options.map((option) => { const result = results[option.id]; return <article className="panel" key={option.id}><p className="eyebrow">{option.label}</p><h2>{option.label}</h2><p className="hint">Voice ID: {option.voiceId}<br />Model: {option.model}</p><button className="btn btn-primary" disabled={!generationEnabled || result?.loading || Boolean(result?.rawAudioUrl)} onClick={() => void generate(option)}>{result?.loading ? "生成中…" : result?.rawAudioUrl ? "生成済み" : generationEnabled ? "この比較音声を1回生成" : "Human承認待ち"}</button>{result?.message && <p className="status-message">{result.message}</p>}{typeof result?.characterCost === "number" && <p className="hint">使用量: {result.characterCost} units</p>}{typeof result?.durationSeconds === "number" && <p className="hint">Duration: {result.durationSeconds.toFixed(2)}秒</p>}{result?.normalizedAudioUrl && result.rawAudioUrl && <><p className="hint">音量統一版（比較推奨）</p><audio controls preload="metadata" src={result.normalizedAudioUrl} /><p className="hint">未加工版</p><audio controls preload="metadata" src={result.rawAudioUrl} /></>}</article>; })}</section>;
}
