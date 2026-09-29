export type NarrationScene = {
  id: string;
  duration: number;
  narration: string;
  subtitle: string;
};

export type SubtitleCue = {
  sceneId: string;
  startMs: number;
  endMs: number;
  text: string;
};

export function normalizeNarration(text: string, language: "ja" | "en" | "zh") {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (language === "en") return compact.replace(/\s+([,.;!?])/g, "$1");
  return compact.replace(/\s+([、。！？])/g, "$1");
}

export function buildNarrationScript(scenes: NarrationScene[], language: "ja" | "en" | "zh") {
  const separator = language === "en" ? "\n\n" : "\n\n";
  return scenes
    .map((scene) => normalizeNarration(scene.narration, language))
    .filter(Boolean)
    .map((sentence) => ensureSentenceEnding(sentence, language))
    .join(separator)
    .replace(/([。！？.!?])\1+/g, "$1");
}

export function estimateNarrationSeconds(text: string, language: "ja" | "en" | "zh") {
  const characters = [...text.replace(/\s/g, "")].length;
  const charactersPerSecond = language === "en" ? 13 : language === "zh" ? 5.5 : 6.5;
  return characters / charactersPerSecond;
}

export function narrationSpeed(text: string, targetSeconds: number, language: "ja" | "en" | "zh") {
  const desired = estimateNarrationSeconds(text, language) / Math.max(1, targetSeconds * 0.86);
  return Math.min(1.12, Math.max(0.88, Number(desired.toFixed(2))));
}

export function assertNarrationFits(
  text: string,
  targetSeconds: number,
  speed: number,
  language: "ja" | "en" | "zh",
) {
  if (estimateNarrationSeconds(text, language) / speed > targetSeconds * 1.3) {
    throw new Error("NARRATION_TOO_LONG");
  }
}

export function buildSubtitleCues(scenes: NarrationScene[]): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let sceneStartMs = 0;
  for (const scene of scenes) {
    // Viewer subtitles are derived only from spoken narration. Scene titles, visual descriptions,
    // prompts, and editor labels are deliberately ignored even when persisted in `subtitle`.
    const text = scene.narration.trim();
    const sentences = splitSentences(text).flatMap((sentence) => splitReadableChunks(sentence, 24));
    const weights = sentences.map((sentence) => Math.max(1, [...sentence].length));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const sceneEndMs = sceneStartMs + scene.duration * 1000;
    const leadInMs = Math.min(280, scene.duration * 50);
    const clearTailMs = Math.min(320, scene.duration * 60);
    const estimatedReadingMs = Math.max(1_100, [...text.replace(/\s/g, "")].length * 145);
    const availableMs = Math.max(600, scene.duration * 1000 - leadInMs - clearTailMs);
    const displayMs = Math.min(availableMs, estimatedReadingMs);
    let cursor = sceneStartMs + leadInMs;
    sentences.forEach((sentence, index) => {
      const durationMs = Math.round((displayMs * weights[index]) / totalWeight);
      const endMs =
        index === sentences.length - 1
          ? Math.min(sceneEndMs - clearTailMs, sceneStartMs + leadInMs + displayMs)
          : Math.min(sceneEndMs - clearTailMs, cursor + durationMs);
      cues.push({ sceneId: scene.id, startMs: cursor, endMs, text: sentence });
      cursor = endMs;
    });
    sceneStartMs += scene.duration * 1000;
  }
  return cues;
}

function ensureSentenceEnding(text: string, language: "ja" | "en" | "zh") {
  if (/[。！？.!?]$/u.test(text)) return text;
  return `${text}${language === "en" ? "." : "。"}`;
}

function splitReadableChunks(text: string, maxCharacters: number) {
  const characters = [...text.trim()];
  if (characters.length <= maxCharacters) return [text.trim()];
  const chunks: string[] = [];
  let rest = characters;
  while (rest.length > maxCharacters) {
    const window = rest.slice(0, maxCharacters + 1);
    let split = -1;
    for (let index = window.length - 1; index >= Math.floor(maxCharacters * 0.55); index -= 1) {
      if (/[、，,。！？.!? ]/u.test(window[index])) {
        split = index + 1;
        break;
      }
    }
    if (split < 0) split = maxCharacters;
    chunks.push(rest.slice(0, split).join("").trim());
    rest = rest.slice(split);
  }
  if (rest.length) chunks.push(rest.join("").trim());
  return chunks.filter(Boolean);
}

function splitSentences(text: string) {
  const matches = text.match(/[^。！？.!?]+[。！？.!?]?/gu)?.map((value) => value.trim()) ?? [];
  return matches.filter(Boolean).length ? matches.filter(Boolean) : [text.trim() || " "];
}
