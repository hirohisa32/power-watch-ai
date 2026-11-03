"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, ScanSearch } from "lucide-react";

type AssetItem = {
  id: string;
  label: string;
  humanLabel: string;
  suggestions: Array<{
    role: string;
    label: string;
    confidence: number;
    featureGatePassed: boolean;
  }>;
  reviewStatus: "HUMAN_LOCKED" | "AUTO_ADOPT_ELIGIBLE" | "HUMAN_REVIEW";
  mismatch: boolean;
  humanLocked: boolean;
  lockedRole: string | null;
};

export function AssetMetadataManager({
  projectId,
  initialAssets,
  roleOptions,
}: {
  projectId: string;
  initialAssets: AssetItem[];
  roleOptions: Array<{ value: string; label: string }>;
}) {
  const [items, setItems] = useState(initialAssets);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function analyze() {
    startTransition(async () => {
      setMessage("");
      const response = await fetch(`/api/projects/${projectId}/assets/analyze`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) return setMessage(body.error ?? "解析できませんでした");
      setMessage(`${body.count}枚の画像内容を解析しました。`);
      window.location.reload();
    });
  }

  function adopt(assetId: string, role: string) {
    startTransition(async () => {
      setMessage("");
      const response = await fetch(`/api/projects/${projectId}/assets/${assetId}/adopt-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = await response.json();
      if (!response.ok) return setMessage(body.error ?? "AI判定を採用できませんでした");
      setItems((current) =>
        current.map((item) =>
          item.id === assetId
            ? { ...item, humanLocked: true, lockedRole: role, reviewStatus: "HUMAN_LOCKED" }
            : item,
        ),
      );
      setMessage("AI判定をHuman Lockとして採用しました。");
    });
  }

  return (
    <div className="asset-metadata-manager">
      <div className="asset-manager-head">
        <p className="hint">Human Labelを正本として保持し、AI候補は整理の補助にのみ使用します。</p>
        <button className="btn btn-small" type="button" onClick={analyze} disabled={pending}>
          <ScanSearch size={14} /> {pending ? "解析中…" : "商品写真を再解析"}
        </button>
      </div>
      {message && <p className="asset-manager-message">{message}</p>}
      <div className="asset-role-list">
        {items.map((asset) => (
          <article className="asset-role-card" key={asset.id}>
            <a
              href={`/api/assets/${asset.id}`}
              target="_blank"
              rel="noreferrer"
              className="asset-thumb"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/assets/${asset.id}`} alt={asset.humanLabel} />
            </a>
            <div className="asset-role-copy">
              <div>
                <span>現在ラベル</span>
                <strong>{asset.humanLabel}</strong>
              </div>
              <div>
                <span>判定状態</span>
                <strong>
                  {asset.reviewStatus === "HUMAN_LOCKED"
                    ? "Human Lock"
                    : asset.reviewStatus === "AUTO_ADOPT_ELIGIBLE"
                      ? "自動採用条件PASS"
                      : "HUMAN_REVIEW"}
                </strong>
              </div>
              <div className="asset-suggestions">
                <span>AI候補</span>
                {asset.suggestions.length ? (
                  <ol>
                    {asset.suggestions.map((suggestion, index) => (
                      <li key={`${suggestion.role}-${index}`}>
                        <span>{suggestion.label}</span>
                        <small>
                          AI推定Confidence {Math.round(suggestion.confidence * 100)}%
                          {!suggestion.featureGatePassed && " · Feature Gate未評価"}
                        </small>
                        {!asset.humanLocked && (
                          <button
                            type="button"
                            onClick={() => adopt(asset.id, suggestion.role)}
                            disabled={pending}
                          >
                            この候補を採用
                          </button>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <strong>未解析</strong>
                )}
              </div>
              {asset.mismatch && (
                <p className="asset-role-warning">
                  <AlertTriangle size={13} /> 要確認：Human LabelとAI候補が矛盾しています
                </p>
              )}
              {!asset.humanLocked && (
                <div className="asset-manual-role">
                  <label htmlFor={`role-${asset.id}`}>別Roleを選択</label>
                  <select
                    id={`role-${asset.id}`}
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value) adopt(asset.id, event.target.value);
                    }}
                    disabled={pending}
                  >
                    <option value="">選択してHuman Lock</option>
                    {roleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {!asset.humanLocked && (
                <p className="asset-label-maintained">
                  <Check size={12} /> 現在ラベルを維持（自動割当で優先）
                </p>
              )}
            </div>
            {asset.humanLocked && (
              <span className="asset-role-lock">
                <Check size={13} /> Human Lock：
                {roleOptions.find((option) => option.value === asset.lockedRole)?.label ??
                  asset.lockedRole}
              </span>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
