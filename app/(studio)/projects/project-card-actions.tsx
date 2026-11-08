"use client";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { projectCardPrimaryAction, type ProjectWorkflow } from "@/lib/ui/project-workflow";

export function ProjectCardActions({
  id,
  title,
  workflow,
}: {
  id: string;
  title: string;
  workflow: ProjectWorkflow;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const primary = projectCardPrimaryAction(id, workflow);

  useEffect(() => {
    if (!menuOpen) return;
    function closeOutside(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  async function action(kind: "duplicate" | "rename" | "delete") {
    setMenuOpen(false);
    if (
      kind === "delete" &&
      !window.confirm(
        `「${title}」を削除します。\nこのプロジェクトと登録画像は元に戻せません。本当に削除しますか？`,
      )
    )
      return;
    const nextTitle =
      kind === "rename" ? window.prompt("新しい動画名を入力してください", title) : null;
    if (kind === "rename" && !nextTitle?.trim()) return;
    setPending(true);
    const response = await fetch(`/api/projects/${id}${kind === "duplicate" ? "/duplicate" : ""}`, {
      method: kind === "duplicate" ? "POST" : kind === "rename" ? "PATCH" : "DELETE",
      headers: kind === "rename" ? { "content-type": "application/json" } : undefined,
      body: kind === "rename" ? JSON.stringify({ title: nextTitle }) : undefined,
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
    <div className="project-card-actions">
      <Link className="btn btn-primary project-card-primary" href={primary.href}>
        {primary.label}
      </Link>
      <div className="project-card-menu" ref={menuRef}>
        <button
          type="button"
          className="project-card-more"
          aria-label="その他の操作"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={pending}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <MoreHorizontal size={21} aria-hidden="true" />
        </button>
        {menuOpen && (
          <div className="project-card-menu-popover" role="menu" aria-label="その他の操作">
            <button role="menuitem" disabled={pending} onClick={() => action("rename")}>
              名前を変更
            </button>
            <button role="menuitem" disabled={pending} onClick={() => action("duplicate")}>
              複製
            </button>
            <button
              role="menuitem"
              className="project-card-menu-danger"
              disabled={pending}
              onClick={() => action("delete")}
            >
              削除
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
