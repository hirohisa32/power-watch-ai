"use client";

import { useState } from "react";

type Voice = { voiceId: string; name: string };

export function NarratorVoiceSelector({
  projectId,
  voices,
  initialVoiceId,
}: {
  projectId: string;
  voices: Voice[];
  initialVoiceId: string | null;
}) {
  const [voiceId, setVoiceId] = useState(initialVoiceId ?? "");
  const [savedVoiceId, setSavedVoiceId] = useState(initialVoiceId ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    if (!voiceId) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/voices/overrides`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "narration", voiceId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Voiceを保存できませんでした");
      setSavedVoiceId(voiceId);
      setMessage("本番Narrator Voiceを保存しました。音声生成はまだ実行していません。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Voiceを保存できませんでした");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">本番Narration設定</p>
      <h2>Narrator Voice</h2>
      <p className="hint">Human承認済みVoiceから選択してください。保存だけではElevenLabs生成を開始しません。</p>
      <div className="field">
        <label htmlFor="narrator-voice">Voice</label>
        <select id="narrator-voice" value={voiceId} onChange={(event) => setVoiceId(event.target.value)}>
          <option value="">選択してください</option>
          {voices.map((voice) => <option key={voice.voiceId} value={voice.voiceId}>{voice.name}</option>)}
        </select>
      </div>
      <button className="btn" type="button" disabled={!voiceId || saving || voiceId === savedVoiceId} onClick={() => void save()}>
        {saving ? "保存中…" : "このVoiceを本番Narratorに設定"}
      </button>
      {message && <p className="status-message">{message}</p>}
    </section>
  );
}
