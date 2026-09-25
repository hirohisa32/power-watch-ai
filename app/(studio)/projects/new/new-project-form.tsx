"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

type WatchFile = { file: File; label: string };
const suggestedLabels = ["Front", "45 degree", "Side", "Caseback", "Wrist", "Dial Macro"];

export function NewProjectForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<WatchFile[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((current) =>
      [
        ...current,
        ...Array.from(list).map((file, i) => ({
          file,
          label: suggestedLabels[current.length + i] ?? `Watch ${current.length + i + 1}`,
        })),
      ].slice(0, 10),
    );
    if (fileRef.current) fileRef.current.value = "";
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          script: form.get("script"),
          style: form.get("style"),
          language: form.get("language"),
          targetDuration: Number(form.get("targetDuration")),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      for (const item of files) {
        const upload = new FormData();
        upload.append("file", item.file);
        upload.append("label", item.label);
        const uploaded = await fetch(`/api/projects/${result.id}/assets`, {
          method: "POST",
          body: upload,
        });
        if (!uploaded.ok) {
          const body = await uploaded.json();
          throw new Error(
            `プロジェクトは保存されましたが、画像「${item.file.name}」をアップロードできませんでした。${body.error ?? ""}`,
          );
        }
      }
      router.push(`/projects/${result.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="form-card" onSubmit={submit}>
      <section className="form-section">
        <h2 className="section-title">01 — Project</h2>
        <div className="field-grid">
          <div className="field field-full">
            <label htmlFor="title">プロジェクト名</label>
            <input
              id="title"
              name="title"
              maxLength={120}
              placeholder="例：1967 — The Racing Chronograph"
              required
            />
          </div>
          <div className="field field-full">
            <label htmlFor="script">台本</label>
            <textarea
              id="script"
              name="script"
              maxLength={30000}
              placeholder="時計の歴史、人物、出来事を含むナレーション台本を入力してください。"
              required
            />
            <span className="hint">
              20〜30,000文字。Phase 2でこの内容からStoryboardを生成します。
            </span>
          </div>
        </div>
      </section>
      <section className="form-section">
        <h2 className="section-title">02 — Direction</h2>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="style">映像スタイル</label>
            <select id="style" name="style" defaultValue="cinematic_real">
              <option value="cinematic_real">Cinematic Real</option>
              <option value="animation">Animation</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="language">ナレーション言語</label>
            <select id="language" name="language" defaultValue="ja">
              <option value="ja">Japanese</option>
              <option value="en">English</option>
              <option value="zh">Chinese</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="targetDuration">目標尺</label>
            <select id="targetDuration" name="targetDuration" defaultValue="60">
              <option value="60">60 sec</option>
              <option value="90">90 sec</option>
            </select>
          </div>
        </div>
      </section>
      <section className="form-section">
        <h2 className="section-title">03 — Watch references</h2>
        <p className="hint">
          JPEG / PNG / WebP、1枚15MBまで、最大10枚。正面・斜め・側面・文字盤Macroなどを推奨します。
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
        />
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          <Plus size={14} /> 時計画像を追加
        </button>
        <div className="upload-list">
          {files.map((item, index) => (
            <div className="upload-row" key={`${item.file.name}-${index}`}>
              <span className="upload-name">
                {item.file.name} · {(item.file.size / 1024 / 1024).toFixed(1)}MB
              </span>
              <input
                aria-label={`${item.file.name}のラベル`}
                value={item.label}
                maxLength={50}
                onChange={(e) =>
                  setFiles((all) =>
                    all.map((value, i) =>
                      i === index ? { ...value, label: e.target.value } : value,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="btn btn-ghost"
                aria-label="削除"
                onClick={() => setFiles((all) => all.filter((_, i) => i !== index))}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "保存中…" : "プロジェクトを保存"}
      </button>
    </form>
  );
}
