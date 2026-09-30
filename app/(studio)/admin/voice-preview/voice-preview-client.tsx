"use client";

import { useState } from "react";

type Option = { label: string; voiceId: string; key: string };
type Result = { audioUrl?: string; message?: string; loading?: boolean; characterCost?: number };

export function VoicePreviewClient({ options }: { options: Option[] }) {
  const [results, setResults] = useState<Record<string, Result>>({});

  async function generate(option: Option) {
    setResults((current) => ({ ...current, [option.voiceId]: { loading: true } }));
    try {
      const response = await fetch("/api/admin/voice-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voiceId: option.voiceId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Voice Previewを生成できませんでした");
      setResults((current) => ({
        ...current,
        [option.voiceId]: {
          audioUrl: `${body.audioUrl}&t=${Date.now()}`,
          message: body.reused
            ? "R2保存済み音声を再利用しました。"
            : "ElevenLabsで1回生成し、R2へ保存しました。",
          characterCost: body.characterCost,
        },
      }));
    } catch (error) {
      setResults((current) => ({
        ...current,
        [option.voiceId]: {
          message: error instanceof Error ? error.message : "生成に失敗しました",
        },
      }));
    }
  }

  return (
    <section className="card-grid">
      {options.map((option) => {
        const result = results[option.voiceId];
        return (
          <article className="panel" key={option.voiceId}>
            <p className="eyebrow">{option.label}</p>
            <h2>{option.label}</h2>
            <p className="hint">Voice ID: {option.voiceId}</p>
            <button
              className="btn btn-primary"
              disabled={result?.loading || Boolean(result?.audioUrl)}
              onClick={() => void generate(option)}
            >
              {result?.loading ? "生成中…" : result?.audioUrl ? "生成済み" : "このVoiceを1回生成"}
            </button>
            {result?.message && (
              <p className="status-message" aria-live="polite">
                {result.message}
              </p>
            )}
            {result?.audioUrl && (
              <>
                <audio controls preload="metadata" src={result.audioUrl} />
                <p>
                  <a className="btn" href={result.audioUrl} download={`${option.key}.mp3`}>
                    MP3を保存
                  </a>
                </p>
              </>
            )}
          </article>
        );
      })}
    </section>
  );
}
