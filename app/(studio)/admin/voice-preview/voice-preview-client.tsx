"use client";

import { useState } from "react";

type Option = { label: string; voiceId: string; key: string };
type Test = { id: string; label: string; text: string };
type Result = {
  rawAudioUrl?: string;
  normalizedAudioUrl?: string;
  message?: string;
  loading?: boolean;
  characterCost?: number;
};

export function VoicePreviewClient({
  options,
  tests,
  generationEnabled,
  initialResults = {},
}: {
  options: Option[];
  tests: Test[];
  generationEnabled: boolean;
  initialResults?: Record<string, Result>;
}) {
  const [results, setResults] = useState<Record<string, Result>>(initialResults);

  async function generate(option: Option, test: Test) {
    const resultKey = `${option.voiceId}:${test.id}`;
    setResults((current) => ({ ...current, [resultKey]: { loading: true } }));
    try {
      const response = await fetch("/api/admin/voice-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voiceId: option.voiceId, testId: test.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Voice Previewを生成できませんでした");
      setResults((current) => ({
        ...current,
        [resultKey]: {
          rawAudioUrl: `${body.rawAudioUrl}&t=${Date.now()}`,
          normalizedAudioUrl: `${body.normalizedAudioUrl}&t=${Date.now()}`,
          message: body.reused
            ? "R2保存済み音声を再利用しました。"
            : "ElevenLabsで1回生成し、R2へ保存しました。",
          characterCost: body.characterCost,
        },
      }));
    } catch (error) {
      setResults((current) => ({
        ...current,
        [resultKey]: {
          message: error instanceof Error ? error.message : "生成に失敗しました",
        },
      }));
    }
  }

  return (
    <section className="card-grid">
      {options.map((option) => {
        return (
          <article className="panel" key={option.voiceId}>
            <p className="eyebrow">{option.label}</p>
            <h2>{option.label}</h2>
            <p className="hint">Voice ID: {option.voiceId}</p>
            {tests.map((test) => {
              const resultKey = `${option.voiceId}:${test.id}`;
              const result = results[resultKey];
              return (
                <div key={test.id}>
                  <p className="hint">
                    {test.label}：{test.text}
                  </p>
                  <button
                    className="btn btn-primary"
                    disabled={!generationEnabled || result?.loading || Boolean(result?.rawAudioUrl)}
                    onClick={() => void generate(option, test)}
                  >
                    {result?.loading
                      ? "生成中…"
                      : result?.rawAudioUrl
                        ? "生成済み"
                        : generationEnabled
                          ? "このTESTを1回生成"
                          : "Human承認待ち"}
                  </button>
                  {result?.message && (
                    <p className="status-message" aria-live="polite">
                      {result.message}
                    </p>
                  )}
                  {typeof result?.characterCost === "number" && (
                    <p className="hint">ElevenLabs使用量: {result.characterCost} units</p>
                  )}
                  {result?.rawAudioUrl && result.normalizedAudioUrl && (
                    <>
                      <p className="hint">音量統一版（比較推奨）</p>
                      <audio controls preload="metadata" src={result.normalizedAudioUrl} />
                      <p className="hint">未加工版</p>
                      <audio controls preload="metadata" src={result.rawAudioUrl} />
                      <p>
                        <a
                          className="btn"
                          href={result.normalizedAudioUrl}
                          download={`${option.key}-${test.id}-normalized.mp3`}
                        >
                          音量統一版を保存
                        </a>
                        <a
                          className="btn"
                          href={result.rawAudioUrl}
                          download={`${option.key}-${test.id}-raw.mp3`}
                        >
                          未加工版を保存
                        </a>
                      </p>
                    </>
                  )}
                </div>
              );
            })}
          </article>
        );
      })}
    </section>
  );
}
