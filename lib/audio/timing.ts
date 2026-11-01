export type NarrationScene = {
  id: string;
  narrationSegmentId?: string | null;
  duration: number;
  narration: string;
  subtitle: string;
};

export type SubtitleCue = {
  sceneId: string;
  narrationSegmentId?: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type NarrationAlignmentData = {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
  source: "provider" | "duration_fallback";
  averageConfidence?: number;
  wordTimings?: Array<{
    text: string;
    startSeconds: number;
    endSeconds: number;
    confidence: number;
  }>;
};

export type SceneSpeechWindow = {
  sceneId: string;
  narrationSegmentId?: string;
  speechStartMs: number;
  speechEndMs: number;
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
    // Prefer the editor-approved short viewer caption. Narration remains the fallback for
    // storyboards created before concise subtitles were introduced.
    const text = scene.subtitle.trim() || scene.narration.trim();
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

export function buildDurationFallbackAlignment(
  script: string,
  durationMs: number,
): NarrationAlignmentData {
  const characters = [...script];
  const weights = characters.map((character) =>
    /[。！？.!?]/u.test(character)
      ? 4.5
      : /[、，,\n]/u.test(character)
        ? 2.4
        : /\s/u.test(character)
          ? 0.55
          : 1,
  );
  const total = Math.max(
    1,
    weights.reduce((sum, weight) => sum + weight, 0),
  );
  let cursor = 0;
  const starts: number[] = [];
  const ends: number[] = [];
  for (const weight of weights) {
    starts.push((cursor / total) * (durationMs / 1000));
    cursor += weight;
    ends.push((cursor / total) * (durationMs / 1000));
  }
  return {
    characters,
    characterStartTimesSeconds: starts,
    characterEndTimesSeconds: ends,
    source: "duration_fallback",
  };
}

export function normalizeProviderAlignment(input: {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}): NarrationAlignmentData {
  return {
    characters: input.characters,
    characterStartTimesSeconds: input.character_start_times_seconds,
    characterEndTimesSeconds: input.character_end_times_seconds,
    source: "provider",
  };
}

export function buildAlignedSubtitleCues(
  scenes: NarrationScene[],
  alignment: NarrationAlignmentData,
  leadMs = 75,
  language: "ja" | "en" | "zh" = "ja",
): SubtitleCue[] {
  const alignedText = alignment.characters.join("");
  const cues: SubtitleCue[] = [];
  let searchFrom = 0;
  for (const scene of scenes) {
    const narration = normalizeNarration(scene.narration, language);
    const compactNarration = narration.replace(/\s+/g, " ");
    let startIndex = alignedText.indexOf(compactNarration, searchFrom);
    if (startIndex < 0) {
      const firstMeaningful = [...compactNarration].findIndex(
        (character) => !/\s/u.test(character),
      );
      const token = [...compactNarration]
        .slice(Math.max(0, firstMeaningful), Math.max(0, firstMeaningful) + 8)
        .join("");
      startIndex = token ? alignedText.indexOf(token, searchFrom) : -1;
    }
    if (startIndex < 0) startIndex = searchFrom;
    const endIndex = Math.min(
      alignment.characters.length - 1,
      startIndex + Math.max(1, [...compactNarration].length) - 1,
    );
    const speechStartMs = Math.round(
      (alignment.characterStartTimesSeconds[startIndex] ?? 0) * 1000,
    );
    const speechEndMs = Math.round(
      (alignment.characterEndTimesSeconds[endIndex] ??
        alignment.characterStartTimesSeconds[endIndex] ??
        speechStartMs / 1000) * 1000,
    );
    const text = scene.subtitle.trim() || narration;
    const matchingWords = alignment.wordTimings?.filter(
      (word) => word.endSeconds * 1000 >= speechStartMs && word.startSeconds * 1000 <= speechEndMs,
    );
    if (matchingWords?.length && matchingWords.some((word) => word.confidence < 0.45)) {
      searchFrom = endIndex + 1;
      continue;
    }
    const chunks = splitSentences(text).flatMap((sentence) => splitReadableChunks(sentence, 24));
    const weights = chunks.map((chunk) => Math.max(1, [...chunk.replace(/\s/g, "")].length));
    const totalWeight = Math.max(
      1,
      weights.reduce((sum, weight) => sum + weight, 0),
    );
    const totalMs = Math.max(300, speechEndMs - speechStartMs);
    let cursor = Math.max(0, speechStartMs - leadMs);
    chunks.forEach((chunk, index) => {
      const endMs =
        index === chunks.length - 1
          ? speechEndMs
          : Math.min(speechEndMs, cursor + Math.round((totalMs * weights[index]) / totalWeight));
      cues.push({
        sceneId: scene.id,
        narrationSegmentId: scene.narrationSegmentId ?? undefined,
        startMs: cursor,
        endMs: Math.max(cursor + 200, endMs),
        text: chunk,
      });
      cursor = endMs;
    });
    searchFrom = endIndex + 1;
  }
  return cues;
}

export function sceneSpeechWindows(
  scenes: NarrationScene[],
  alignment: NarrationAlignmentData,
  language: "ja" | "en" | "zh" = "ja",
): SceneSpeechWindow[] {
  const alignedText = alignment.characters.join("");
  let searchFrom = 0;
  return scenes.map((scene) => {
    const narration = normalizeNarration(scene.narration, language);
    let startIndex = alignedText.indexOf(narration, searchFrom);
    if (startIndex < 0) {
      const token = [...narration.replace(/\s/g, "")].slice(0, 8).join("");
      startIndex = token ? alignedText.indexOf(token, searchFrom) : -1;
    }
    if (startIndex < 0) startIndex = searchFrom;
    const endIndex = Math.min(
      alignment.characters.length - 1,
      startIndex + Math.max(1, [...narration].length) - 1,
    );
    searchFrom = endIndex + 1;
    return {
      sceneId: scene.id,
      narrationSegmentId: scene.narrationSegmentId ?? undefined,
      speechStartMs: Math.round((alignment.characterStartTimesSeconds[startIndex] ?? 0) * 1000),
      speechEndMs: Math.round(
        (alignment.characterEndTimesSeconds[endIndex] ??
          alignment.characterStartTimesSeconds[endIndex] ??
          0) * 1000,
      ),
    };
  });
}

export function averageSubtitleLeadMs(
  cues: SubtitleCue[],
  scenes: NarrationScene[],
  alignment: NarrationAlignmentData,
) {
  const firstCue = new Map<string, SubtitleCue>();
  cues.forEach((cue) => firstCue.has(cue.sceneId) || firstCue.set(cue.sceneId, cue));
  const alignedText = alignment.characters.join("");
  let searchFrom = 0;
  const offsets: number[] = [];
  for (const scene of scenes) {
    const index = alignedText.indexOf(normalizeNarration(scene.narration, "ja"), searchFrom);
    if (index < 0) continue;
    const speechStart = (alignment.characterStartTimesSeconds[index] ?? 0) * 1000;
    const cue = firstCue.get(scene.id);
    if (cue) offsets.push(cue.startMs - speechStart);
    searchFrom = index + scene.narration.length;
  }
  return offsets.length ? offsets.reduce((sum, value) => sum + value, 0) / offsets.length : 0;
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
