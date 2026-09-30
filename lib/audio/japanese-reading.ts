export type JapaneseReadingEntry = {
  display: string;
  reading: string;
  source: "system" | "project" | "human";
};

export const SYSTEM_JAPANESE_READING_DICTIONARY: readonly JapaneseReadingEntry[] = [
  { display: "1970年代", reading: "せんきゅうひゃくななじゅうねんだい", source: "system" },
  { display: "変革期", reading: "へんかくき", source: "system" },
  { display: "カンジャル", reading: "カンジャル", source: "system" },
  { display: "国家", reading: "こっか", source: "system" },
  { display: "ASPREY", reading: "アスプレイ", source: "system" },
  { display: "Sea-Dweller", reading: "シードゥエラー", source: "system" },
  { display: "Rolex", reading: "ロレックス", source: "system" },
] as const;

export function applyJapaneseReadingDictionary(displayScript: string, entries: readonly JapaneseReadingEntry[]) {
  let ttsInputText = displayScript;
  const applied: JapaneseReadingEntry[] = [];
  const ordered = [...entries].sort((a, b) => b.display.length - a.display.length);
  for (const entry of ordered) {
    if (!entry.display || !ttsInputText.includes(entry.display)) continue;
    ttsInputText = ttsInputText.replaceAll(entry.display, entry.reading);
    applied.push({ ...entry });
  }
  return { ttsInputText, applied };
}
