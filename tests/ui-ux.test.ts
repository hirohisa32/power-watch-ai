import { afterEach, describe, expect, it } from "vitest";
import { friendlyError, GENERATION_STATUS_LABELS, isAdminEmail, LANGUAGE_LABELS, PROJECT_STATUS_LABELS, projectProgress, STYLE_LABELS } from "@/lib/ui/presentation";
import { moveItem, restoreWizardDraft, serializeWizardDraft, validateScriptStep, type WizardDraft } from "@/lib/ui/wizard";

const draft: WizardDraft = { title: "ピアース", script: "時計の歴史を丁寧に紹介するための十分な長さの台本です。", style: "cinematic_real", language: "ja", targetDuration: 60, narration: "auto", voiceId: "", bgm: "auto", bgmKey: "" };

describe("クライアント向けUI表現", () => {
  it("技術Statusを自然な日本語へ変換する", () => {
    expect(PROJECT_STATUS_LABELS.generating).toBe("映像生成中");
    expect(GENERATION_STATUS_LABELS.queued).toBe("準備中");
  });
  it("スタイルと言語を日本語で表示する", () => {
    expect(STYLE_LABELS.cinematic_real).toBe("実写調");
    expect(LANGUAGE_LABELS.zh).toBe("中国語");
  });
  it("状態から一貫した進捗率を返す", () => {
    expect(projectProgress("draft")).toBe(10);
    expect(projectProgress("completed")).toBe(100);
  });
  it("技術Errorを利用者向け文言へ変換する", () => {
    expect(friendlyError("INSUFFICIENT_CREDITS")).toContain("残高");
    expect(friendlyError("ffmpeg process failed")).toContain("最終動画");
  });
  it("管理者Emailのみを管理者として扱う", () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    expect(isAdminEmail("ADMIN@example.com")).toBe(true);
    expect(isAdminEmail("client@example.com")).toBe(false);
  });
});

describe("新規動画作成Wizard", () => {
  afterEach(() => { delete process.env.ADMIN_EMAIL; });
  it("タイトルと20文字以上の台本を検証する", () => {
    expect(validateScriptStep({ title: "", script: draft.script })).toContain("タイトル");
    expect(validateScriptStep(draft)).toBeNull();
  });
  it("自動保存データを復元する", () => {
    expect(restoreWizardDraft(serializeWizardDraft(draft), { ...draft, title: "" })).toEqual(draft);
  });
  it("時計画像の並び順を変更し境界を守る", () => {
    expect(moveItem(["正面", "裏蓋"], 1, -1)).toEqual(["裏蓋", "正面"]);
    expect(moveItem(["正面"], 0, -1)).toEqual(["正面"]);
  });
});
