"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function StoryboardButton({ projectId, exists }: { projectId: string; exists: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (exists)
    return (
      <Link className="btn btn-primary" href={`/projects/${projectId}/storyboard`}>
        動画構成を確認
      </Link>
    );
  async function generate() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/storyboard`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      router.push(`/projects/${projectId}/storyboard`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成できませんでした");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="action-stack">
      <button className="btn btn-primary" disabled={pending} onClick={generate}>
        {pending ? "動画構成を準備しています…" : "動画構成を作成"}
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
