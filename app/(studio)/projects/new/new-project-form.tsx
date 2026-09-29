"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, ImagePlus, Star, X } from "lucide-react";
import { moveItem, restoreWizardDraft, serializeWizardDraft, validateScriptStep, type WizardDraft } from "@/lib/ui/wizard";
import { clearWizardFiles, loadWizardFiles, saveWizardFiles } from "@/lib/ui/wizard-storage";

type WatchFile = { file: File; label: string; preview: string };
type Draft = WizardDraft;
const STORAGE_KEY = "power-watch:new-video-draft";
const labels = ["正面", "斜め45度", "文字盤アップ", "側面", "裏蓋", "ムーブメント", "腕装着", "その他"];
const initial: Draft = { title: "", script: "", style: "cinematic_real", language: "ja", targetDuration: 60, narration: "auto", voiceId: "", bgm: "auto", bgmKey: "" };

export function NewProjectForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState(initial);
  const [files, setFiles] = useState<WatchFile[]>([]);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [voices, setVoices] = useState<Array<{ voiceId: string; name: string }>>([]);
  const [bgms, setBgms] = useState<Array<{ key: string; name: string; genre: string; mood: string }>>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const value = restoreWizardDraft(saved, initial);
    window.setTimeout(() => setDraft(value), 0);
  }, []);
  useEffect(() => {
    let active = true;
    loadWizardFiles().then((stored) => {
      if (active && stored.length) setFiles(stored.map((item) => ({ ...item, preview: URL.createObjectURL(item.file) })));
    }).catch(() => undefined).finally(() => { if (active) setFilesLoaded(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { window.localStorage.setItem(STORAGE_KEY, serializeWizardDraft(draft)); setSaveState("saved"); }, 450);
    return () => window.clearTimeout(timer);
  }, [draft]);
  useEffect(() => {
    let active = true;
    fetch("/api/voices/presets").then((response) => response.ok ? response.json() : { presets: [] }).then((body) => { if (active) setVoices((body.presets ?? []).filter((voice: { approved?: boolean }) => voice.approved !== false)); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/bgm").then((response) => response.ok ? response.json() : { items: [] }).then((body) => { if (active) setBgms(body.items ?? []); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!filesLoaded) return;
    const timer = window.setTimeout(() => { void saveWizardFiles(files.map(({ file, label }) => ({ file, label }))); }, 450);
    return () => window.clearTimeout(timer);
  }, [files, filesLoaded]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setSaveState("saving"); setDraft((current) => ({ ...current, [key]: value })); }
  function addFiles(list: FileList | File[]) {
    const items = Array.from(list).filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type));
    setFiles((current) => [...current, ...items.map((file, index) => ({ file, label: labels[current.length + index] ?? "その他", preview: URL.createObjectURL(file) }))].slice(0, 10));
    if (fileRef.current) fileRef.current.value = "";
  }
  function move(index: number, direction: -1 | 1) {
    setFiles((current) => moveItem(current, index, direction));
  }
  function next() {
    setError("");
    const validationError = validateScriptStep(draft);
    if (step === 1 && validationError) return setError(validationError), undefined;
    if (step === 2 && files.length === 0) return setError("時計画像を1枚以上追加してください。"), undefined;
    setStep((value) => Math.min(3, value + 1));
  }
  async function submit() {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: draft.title, script: draft.script, style: draft.style, language: draft.language, targetDuration: draft.targetDuration, narratorVoiceId: draft.narration === "manual" ? draft.voiceId || undefined : undefined, bgmKey: draft.bgm === "manual" ? draft.bgmKey || undefined : undefined }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      for (const item of files) {
        const upload = new FormData(); upload.append("file", item.file); upload.append("label", item.label);
        const uploaded = await fetch(`/api/projects/${result.id}/assets`, { method: "POST", body: upload });
        if (!uploaded.ok) throw new Error("画像のアップロードに失敗しました。動画は下書きとして保存されています。");
      }
      window.localStorage.removeItem(STORAGE_KEY);
      await clearWizardFiles();
      const storyboard = await fetch(`/api/projects/${result.id}/storyboard`, { method: "POST" });
      if (!storyboard.ok) {
        router.push(`/projects/${result.id}`); router.refresh();
        return;
      }
      router.push(`/projects/${result.id}/storyboard`); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "動画を保存できませんでした。もう一度お試しください。"); }
    finally { setPending(false); }
  }

  return <div className="wizard-shell">
    <ol className="wizard-steps" aria-label="作成手順">{["台本", "時計画像", "動画設定"].map((label, index) => <li key={label} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""}><span>{step > index + 1 ? <Check size={14} /> : index + 1}</span>{label}</li>)}</ol>
    <div className="autosave" aria-live="polite">{saveState === "saving" ? "保存中…" : "保存済み"}</div>
    {step === 1 && <section className="wizard-panel"><p className="step-label">ステップ 1 / 3</p><h2>台本を入力</h2><p className="hint">動画のタイトルと、ナレーションの元になる文章を入力します。</p><div className="field"><label htmlFor="title">動画タイトル</label><input id="title" value={draft.title} maxLength={120} onChange={(e) => update("title", e.target.value)} placeholder="例：ピアース キャリバー134の物語" autoFocus /></div><div className="field"><label htmlFor="script">台本</label><textarea id="script" value={draft.script} maxLength={30000} onChange={(e) => update("script", e.target.value)} placeholder="時計の歴史、人物、出来事などを入力してください。" /><span className="character-count">{draft.script.length.toLocaleString()} / 30,000文字</span></div></section>}
    {step === 2 && <section className="wizard-panel"><p className="step-label">ステップ 2 / 3</p><h2>時計画像を追加</h2><p className="hint">一番上の画像がメイン画像です。複数の角度があると時計を正確に表現できます。</p><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} /><button type="button" className={`drop-zone ${dragging ? "dragging" : ""}`} onClick={() => fileRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}><ImagePlus size={28} /><strong>画像をドラッグ＆ドロップ</strong><span>またはクリックして選択（最大10枚）</span></button><div className="image-upload-grid">{files.map((item, index) => <article key={item.preview} className="image-upload-card"><div className="image-preview"><img src={item.preview} alt={`${item.label}のプレビュー`} />{index === 0 && <span className="main-image"><Star size={12} />メイン</span>}</div><select aria-label={`${item.file.name}のラベル`} value={item.label} onChange={(e) => setFiles((all) => all.map((value, i) => i === index ? { ...value, label: e.target.value } : value))}>{labels.map((label) => <option key={label}>{label}</option>)}</select><div className="image-actions"><button type="button" aria-label="前へ移動" onClick={() => move(index, -1)} disabled={index === 0}><ChevronUp size={15} /></button><button type="button" aria-label="後ろへ移動" onClick={() => move(index, 1)} disabled={index === files.length - 1}><ChevronDown size={15} /></button><button type="button" aria-label="画像を削除" onClick={() => setFiles((all) => all.filter((_, i) => i !== index))}><X size={15} /></button></div></article>)}</div></section>}
    {step === 3 && <section className="wizard-panel"><p className="step-label">ステップ 3 / 3</p><h2>動画設定</h2><div className="choice-grid"><Choice title="動画スタイル" value={draft.style} onChange={(value) => update("style", value as Draft["style"])} options={[["cinematic_real", "実写調"], ["animation", "アニメ調"]]} /><Choice title="言語" value={draft.language} onChange={(value) => update("language", value as Draft["language"])} options={[["ja", "日本語"], ["en", "英語"], ["zh", "中国語"]]} /><Choice title="動画の長さ" value={String(draft.targetDuration)} onChange={(value) => update("targetDuration", Number(value) as 60 | 90)} options={[["60", "60秒"], ["90", "90秒"]]} /><Choice title="ナレーション" value={draft.narration} onChange={(value) => update("narration", value as Draft["narration"])} options={[["auto", "自動で選ぶ"], ["manual", "声を指定する"]]} /><Choice title="BGM" value={draft.bgm} onChange={(value) => update("bgm", value as Draft["bgm"])} options={[["auto", "自動で選ぶ"], ["manual", "BGMを指定する"]]} /></div>{draft.narration === "manual" && <div className="field"><label htmlFor="voice">ナレーションの声</label><select id="voice" value={draft.voiceId} onChange={(e) => update("voiceId", e.target.value)}><option value="">自動で選ぶ</option>{voices.map((voice) => <option key={voice.voiceId} value={voice.voiceId}>{voice.name}</option>)}</select>{voices.length === 0 && <span className="hint">現在選べる声がないため、自動で選びます。</span>}</div>}{draft.bgm === "manual" && <div className="field"><label htmlFor="bgm">BGM</label><select id="bgm" value={draft.bgmKey} onChange={(e) => update("bgmKey", e.target.value)}><option value="">自動で選ぶ</option>{bgms.map((bgm) => <option key={bgm.key} value={bgm.key}>{bgm.name} — {bgm.genre} / {bgm.mood}</option>)}</select>{bgms.length === 0 && <span className="hint">現在選べる承認済みBGMがありません。</span>}</div>}<div className="opening-setting"><div><strong>POWER WATCH Opening</strong><p>ブランド共通のOpeningを使用します。</p></div><span className="toggle-on">使用する</span></div></section>}
    {error && <p className="error error-box" role="alert">{error}</p>}
    <div className="wizard-actions">{step > 1 && <button className="btn" onClick={() => setStep((value) => value - 1)}><ArrowLeft size={15} />戻る</button>}<span />{step < 3 ? <button className="btn btn-primary" onClick={next}>次へ<ArrowRight size={15} /></button> : <button className="btn btn-primary" disabled={pending} onClick={submit}>{pending ? "保存しています…" : "動画構成を作成"}</button>}</div>
  </div>;
}

function Choice({ title, value, options, onChange }: { title: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return <fieldset className="choice-group"><legend>{title}</legend>{options.map(([key, label]) => <label key={key} className={value === key ? "selected" : ""}><input type="radio" name={title} value={key} checked={value === key} onChange={(e) => onChange(e.target.value)} />{label}</label>)}</fieldset>;
}
