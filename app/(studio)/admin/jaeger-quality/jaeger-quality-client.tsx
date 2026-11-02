"use client";

import { useState } from "react";

type Status = {
  prepared?: boolean;
  allIncludedReady?: boolean;
  missingSceneIds?: string[];
  storyQuality?: { average?: number; purchaseDesire?: number };
  productArc?: { passed?: boolean; desireCount?: number; evidenceCount?: number };
  error?: string;
};

export function JaegerQualityClient() {
  const [status, setStatus] = useState<Status>();
  const [pending, setPending] = useState(false);

  const load = async () => {
    const response = await fetch("/api/admin/reel-quality/jaeger", { cache: "no-store" });
    setStatus((await response.json()) as Status);
  };

  const prepare = async () => {
    setPending(true);
    try {
      const response = await fetch("/api/admin/reel-quality/jaeger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "prepare" }),
      });
      setStatus((await response.json()) as Status);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="stack">
      <div className="card-actions">
        <button className="btn btn-primary" disabled={pending} onClick={() => void prepare()}>
          {pending ? "適用中…" : "承認済み最適化を適用"}
        </button>
        <button className="btn" disabled={pending} onClick={() => void load()}>
          状態を更新
        </button>
      </div>
      {status?.error ? <p className="status-message">{status.error}</p> : null}
      {status ? (
        <div className="admin-table">
          <div><span>Plan</span><span>{status.prepared ? "適用済み" : "未適用"}</span></div>
          <div><span>Scene</span><span>{status.allIncludedReady ? "全Scene完成" : `${status.missingSceneIds?.length ?? 0} Scene未生成`}</span></div>
          <div><span>Story Quality</span><span>{status.storyQuality?.average ?? "—"}</span></div>
          <div><span>Purchase Desire</span><span>{status.storyQuality?.purchaseDesire ?? "—"}</span></div>
          <div><span>Product Arc</span><span>{status.productArc?.passed ? "PASS" : "REVIEW"}</span></div>
        </div>
      ) : null}
    </div>
  );
}
