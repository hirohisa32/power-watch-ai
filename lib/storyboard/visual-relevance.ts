export type VisualRelevanceInput = {
  narration: string;
  visualIntent: string;
  visualSubject: string;
  historicalPeriod?: string | null;
  year?: string | null;
  location?: string | null;
  characterId?: string | null;
  watchReference: boolean;
  productPhotoRole?: string | null;
  visualType: string;
};

export type VisualRelevanceResult = {
  score: number;
  status: "pass" | "review" | "ng";
  breakdown: {
    historicalPeriod: number;
    location: number;
    character: number;
    actionAndSubject: number;
    productConnection: number;
    narrationMatch: number;
  };
};

const normalize = (value: string) =>
  value
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/[\s、。！？,.!?'"「」『』（）()\-–—:/]/gu, "");

function bigrams(value: string) {
  const text = [...normalize(value)];
  if (text.length < 2) return new Set(text);
  return new Set(text.slice(0, -1).map((character, index) => `${character}${text[index + 1]}`));
}

function semanticOverlap(left: string, right: string) {
  const source = bigrams(left);
  const target = bigrams(right);
  if (!source.size || !target.size) return 0;
  const shared = [...source].filter((token) => target.has(token)).length;
  return shared / Math.min(source.size, target.size);
}

function explicitMatch(value: string | null | undefined, context: string, fullScore: number) {
  if (!value?.trim()) return fullScore;
  return normalize(context).includes(normalize(value)) ? fullScore : Math.round(fullScore * 0.4);
}

export function evaluateVisualRelevance(input: VisualRelevanceInput): VisualRelevanceResult {
  const visual = `${input.visualIntent} ${input.visualSubject}`;
  const context = `${input.narration} ${visual}`;
  const period = explicitMatch(input.historicalPeriod || input.year, context, 15);
  const location = explicitMatch(input.location, context, 15);
  const character = input.characterId ? explicitMatch(input.characterId, visual, 15) : 15;
  const overlap = semanticOverlap(input.narration, visual);
  const actionAndSubject = Math.round(25 * Math.min(1, overlap * 2.3));
  const productConnection = input.watchReference
    ? input.productPhotoRole ||
      /時計|watch|dial|case|movement|文字盤|刻印|ムーブメント/iu.test(visual)
      ? 20
      : 8
    : input.visualType === "product_photo"
      ? 5
      : 20;
  const narrationMatch = Math.round(10 * Math.min(1, overlap * 2.8));
  const score =
    period + location + character + actionAndSubject + productConnection + narrationMatch;
  return {
    score,
    status: score >= 85 ? "pass" : score >= 70 ? "review" : "ng",
    breakdown: {
      historicalPeriod: period,
      location,
      character,
      actionAndSubject,
      productConnection,
      narrationMatch,
    },
  };
}
