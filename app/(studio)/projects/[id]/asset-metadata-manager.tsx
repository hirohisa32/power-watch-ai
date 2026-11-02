"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, ScanSearch } from "lucide-react";

type AssetItem = {
  id: string;
  label: string;
  humanLabel: string;
  detectedRole: string | null;
  detectedRoleLabel: string | null;
  confidence: number | null;
  mismatch: boolean;
  humanLocked: boolean;
};

export function AssetMetadataManager({
  projectId,
  initialAssets,
}: {
  projectId: string;
  initialAssets: AssetItem[];
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

  function adopt(assetId: string) {
    startTransition(async () => {
      setMessage("");
      const response = await fetch(`/api/projects/${projectId}/assets/${assetId}/adopt-role`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) return setMessage(body.error ?? "AI判定を採用できませんでした");
      setItems((current) =>
        current.map((item) => (item.id === assetId ? { ...item, humanLocked: true } : item)),
      );
      setMessage("AI判定をHuman Lockとして採用しました。");
    });
  }

  return (
    <div className="asset-metadata-manager">
      <div className="asset-manager-head">
        <p className="hint">Human入力を保持したまま、画像内容をAIで分類します。</p>
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
                <span>AI判定Role</span>
                <strong>{asset.detectedRoleLabel ?? "未解析"}</strong>
              </div>
              <div>
                <span>Confidence</span>
                <strong>
                  {asset.confidence == null ? "—" : `${Math.round(asset.confidence * 100)}%`}
                </strong>
              </div>
              {asset.mismatch && (
                <p className="asset-role-warning">
                  <AlertTriangle size={13} /> 登録ラベルと画像内容が異なる可能性があります
                </p>
              )}
            </div>
            {asset.detectedRole &&
              (asset.humanLocked ? (
                <span className="asset-role-lock">
                  <Check size={13} /> Human Lock
                </span>
              ) : (
                <button
                  className="btn btn-small"
                  type="button"
                  onClick={() => adopt(asset.id)}
                  disabled={pending}
                >
                  AI判定を採用
                </button>
              ))}
          </article>
        ))}
      </div>
    </div>
  );
}
