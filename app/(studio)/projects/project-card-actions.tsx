"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProjectCardActions({ id, completed }: { id: string; completed: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function action(kind: "duplicate" | "rename" | "delete") {
    if (
      kind === "delete" &&
      !window.confirm("このプロジェクトと画像を削除します。よろしいですか？")
    )
      return;
    const title = kind === "rename" ? window.prompt("新しい動画名を入力してください") : null;
    if (kind === "rename" && !title?.trim()) return;
    setPending(true);
    const response = await fetch(`/api/projects/${id}${kind === "duplicate" ? "/duplicate" : ""}`, {
      method: kind === "duplicate" ? "POST" : kind === "rename" ? "PATCH" : "DELETE",
      headers: kind === "rename" ? { "content-type": "application/json" } : undefined,
      body: kind === "rename" ? JSON.stringify({ title }) : undefined,
    });
    setPending(false);
    if (!response.ok) {
      const body = await response.json();
      window.alert(body.error ?? "処理できませんでした");
      return;
    }
    if (kind === "duplicate") {
      const copy = await response.json();
      router.push(`/projects/${copy.id}`);
      return;
    }
    router.refresh();
  }
  return (
    <div className="card-actions">
      {completed && (
        <Link
          className="btn btn-primary"
          href={`/projects/${id}/storyboard?section=completed#completed-video`}
        >
          完成動画を見る
        </Link>
      )}
      <Link
        className={completed ? "btn btn-secondary" : "btn btn-primary"}
        href={`/projects/${id}`}
      >
        動画詳細
      </Link>
      <Link className="btn" href={`/projects/${id}/storyboard`}>
        動画構成
      </Link>
      <button className="btn" disabled={pending} onClick={() => action("duplicate")}>
        複製
      </button>
      <button className="btn" disabled={pending} onClick={() => action("rename")}>
        名前を変更
      </button>
      <button className="btn btn-danger" disabled={pending} onClick={() => action("delete")}>
        削除
      </button>
    </div>
  );
}
