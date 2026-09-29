import type { BgmCandidate, BgmSelectionInput, RankedBgm } from "./types";

const signals: Array<{ pattern: RegExp; tags: string[]; reason: string }> = [
  {
    pattern: /歴史|年代|王|国王|宮廷|国家|heritage|histor|royal|king|palace/i,
    tags: ["historical", "regal", "documentary", "ceremonial"],
    reason: "歴史・国家ストーリー",
  },
  {
    pattern: /オマーン|oman|中東|アラブ|khanjar|カンジャル/i,
    tags: ["historical", "regal", "mysterious", "documentary"],
    reason: "中東の歴史的世界観",
  },
  {
    pattern: /高級|名門|luxury|premium|gold|ゴールド|宝飾|時計|watch/i,
    tags: ["luxury", "premium", "elegant", "product"],
    reason: "高級商品・ブランド表現",
  },
  {
    pattern: /謎|秘密|希少|暗|mystery|rare|secret|dark/i,
    tags: ["mysterious", "dark", "quiet"],
    reason: "静かな謎と希少性",
  },
  {
    pattern: /感動|希望|人間|emotional|hope|human/i,
    tags: ["emotional", "hopeful", "warm"],
    reason: "感情的な物語",
  },
  {
    pattern: /企業|技術|business|corporate|technology/i,
    tags: ["corporate", "technology"],
    reason: "企業・技術テーマ",
  },
];

export function rankBgm(catalog: BgmCandidate[], input: BgmSelectionInput): RankedBgm[] {
  const active = catalog.filter((item) => item.active);
  if (input.manualKey) {
    const manual = active.find((item) => item.key === input.manualKey);
    if (manual) return [{ ...manual, score: Number.MAX_SAFE_INTEGER, reasons: ["Human指定"] }];
  }
  const context = `${input.script} ${input.storyProfile ?? ""}`;
  return active
    .map((item) => {
      let score = 0;
      const reasons: string[] = [];
      const itemSignals = new Set([...item.tags, ...item.suitableStyles, item.genre, item.mood]);
      for (const signal of signals) {
        if (!signal.pattern.test(context)) continue;
        const hits = signal.tags.filter((tag) => [...itemSignals].some((value) => value.includes(tag)));
        score += hits.length * 3;
        if (hits.length) reasons.push(signal.reason);
      }
      if (input.style === "cinematic_real") {
        const hits = item.tags.filter((tag) => ["cinematic", "documentary", "premium"].includes(tag));
        score += hits.length * 2;
      }
      if (item.tags.includes("quiet") || item.tags.includes("documentary")) {
        score += 2;
        reasons.push("ナレーションを妨げにくい構成");
      }
      if (item.durationMs >= input.targetDuration * 1000) score += 1;
      return { ...item, score, reasons: [...new Set(reasons)] };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ja"));
}

export function selectBgm(catalog: BgmCandidate[], input: BgmSelectionInput) {
  const [selected] = rankBgm(catalog, input);
  if (!selected) throw new Error("利用可能な承認済みBGMがありません");
  return selected;
}
