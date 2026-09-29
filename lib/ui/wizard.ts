export type WizardDraft = {
  title: string;
  script: string;
  style: "cinematic_real" | "animation";
  language: "ja" | "en" | "zh";
  targetDuration: 60 | 90;
  narration: "auto" | "manual";
  voiceId: string;
};

export function validateScriptStep(draft: Pick<WizardDraft, "title" | "script">) {
  if (!draft.title.trim()) return "動画タイトルを入力してください。";
  if (draft.script.trim().length < 20) return "台本は20文字以上で入力してください。";
  return null;
}

export function serializeWizardDraft(draft: WizardDraft) {
  return JSON.stringify(draft);
}

export function restoreWizardDraft(value: string | null, fallback: WizardDraft): WizardDraft {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as Partial<WizardDraft>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

export function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
