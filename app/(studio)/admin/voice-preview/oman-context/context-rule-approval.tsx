"use client";

import { useState } from "react";

export function ContextRuleApproval({ displayPattern, ttsTemplate, voiceId }: { displayPattern: string; ttsTemplate: string; voiceId: string }) {
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function approve() {
    setSaving(true);
    const response = await fetch("/api/admin/context-pronunciation-rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayPattern, ttsTemplate, voiceId }) });
    const body = await response.json();
    setMessage(response.ok ? "承認済みContext Ruleへ保存しました。" : body.error || "保存できませんでした");
    setSaving(false);
  }
  return <div><button className="btn" disabled={saving || Boolean(message)} onClick={() => void approve()}>{saving ? "保存中…" : "このVoice／構文をHuman承認"}</button>{message && <p className="status-message">{message}</p>}</div>;
}
