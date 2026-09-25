"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProjectCardActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function action(kind: "duplicate" | "delete") {
    if (
      kind === "delete" &&
      !window.confirm("このプロジェクトと画像を削除します。よろしいですか？")
    )
      return;
    setPending(true);
    const response = await fetch(`/api/projects/${id}${kind === "duplicate" ? "/duplicate" : ""}`, {
      method: kind === "duplicate" ? "POST" : "DELETE",
    });
    setPending(false);
    if (!response.ok) {
      const body = await response.json();
      window.alert(body.error ?? "処理できませんでした");
      return;
    }
    router.refresh();
  }
  return (
    <div className="card-actions">
      <Link className="btn" href={`/projects/${id}`}>
        開く
      </Link>
      <button className="btn" disabled={pending} onClick={() => action("duplicate")}>
        複製
      </button>
      <button className="btn btn-danger" disabled={pending} onClick={() => action("delete")}>
        削除
      </button>
    </div>
  );
}
