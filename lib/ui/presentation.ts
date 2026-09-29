export const PROJECT_STATUS_LABELS = {
  draft: "下書き",
  storyboard: "構成確認中",
  generating: "映像生成中",
  completed: "完成",
  failed: "要確認",
} as const;

export const GENERATION_STATUS_LABELS = {
  queued: "準備中",
  generating: "生成中",
  completed: "完成",
  failed: "失敗",
  canceled: "中止",
} as const;

export const LANGUAGE_LABELS = { ja: "日本語", en: "英語", zh: "中国語" } as const;
export const STYLE_LABELS = { cinematic_real: "実写調", animation: "アニメ調" } as const;

export function projectProgress(status: keyof typeof PROJECT_STATUS_LABELS) {
  return { draft: 10, storyboard: 30, generating: 65, completed: 100, failed: 65 }[status];
}

export function friendlyError(message?: string | null) {
  if (message && /[ぁ-んァ-ヶ一-龠]/.test(message)) return message;
  const value = message?.toLowerCase() ?? "";
  if (value.includes("credit") || value.includes("balance"))
    return "動画生成用の残高が不足しています。管理者へお問い合わせください。";
  if (value.includes("upload") || value.includes("storage") || value.includes("r2"))
    return "画像のアップロードに失敗しました。もう一度お試しください。";
  if (value.includes("audio") || value.includes("voice") || value.includes("eleven"))
    return "音声の作成に失敗しました。もう一度お試しください。";
  if (value.includes("render") || value.includes("ffmpeg"))
    return "最終動画の作成に失敗しました。もう一度お試しください。";
  return "映像の生成に失敗しました。もう一度お試しください。";
}

export function isAdminEmail(email: string) {
  return email.toLowerCase() === (process.env.ADMIN_EMAIL ?? "").toLowerCase();
}
