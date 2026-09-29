"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BillingActions({ month, settlementId }: { month?: string; settlementId?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    if (
      month &&
      !window.confirm(`${month.replace("-", "年")}月の請求額を締めます。締め後は変更できません。`)
    )
      return;
    setPending(true);
    setError("");
    try {
      const url = settlementId
        ? `/api/admin/billing/settlements/${settlementId}/retry`
        : `/api/admin/billing/months/${month}/close`;
      const response = await fetch(url, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "処理に失敗しました");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "処理に失敗しました");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="billing-action">
      <button
        className={month ? "btn btn-primary" : "btn"}
        onClick={() => void run()}
        disabled={pending}
      >
        {pending ? "処理中…" : settlementId ? "為替レートを再取得" : "この月を締める"}
      </button>
      {error && <small className="error">{error}</small>}
    </span>
  );
}
