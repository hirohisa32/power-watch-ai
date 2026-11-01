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

const SEMANTIC_CONCEPTS: Array<[RegExp, RegExp]> = [
  [/生み出|誕生|製作|開発/iu, /工房|作業台|職人|製作|開発/iu],
  [/精度|精密/iu, /測定|計測|精度|調整|検査/iu],
  [/系譜|受け継|つなが|歴史|時計史/iu, /系譜|受け継|資料|記録|歴史|時計史|ムーブメント/iu],
  [/表示義務|原産国|産業を守/iu, /資料|文書|産業史|法令|記録/iu],
  [/逃れ|国境|移住|職人たち/iu, /移動|旅|国境|後ろ姿|職人/iu],
];

function semanticConceptMatch(narration: string, visual: string) {
  return SEMANTIC_CONCEPTS.some(
    ([narrationPattern, visualPattern]) =>
      narrationPattern.test(narration) && visualPattern.test(visual),
  );
}

const PRODUCT_ROLE_PATTERNS: Record<string, RegExp> = {
  front: /時計|一本|全体|正面/iu,
  dial: /文字盤|ダイヤル|針|インデックス|ベゼル|クルー?ド・パリ/iu,
  case: /ケース|金無垢/iu,
  side: /ケース|側面|リューズ|竜頭/iu,
  crown: /リューズ|竜頭|クラウン/iu,
  caseback: /裏蓋|ケース|刻印|マーク/iu,
  movement: /ムーブメント|機械|機構|キャリバー|スワンネック|シャトン/iu,
  engraving: /刻印|マーク|シリアル|銘/iu,
  bracelet: /ブレスレット|ベルト|クラスプ/iu,
  hero: /時計|一本|全体|美しい|特別/iu,
};

export function evaluateVisualRelevance(input: VisualRelevanceInput): VisualRelevanceResult {
  const visual = `${input.visualIntent} ${input.visualSubject}`;
  const context = `${input.narration} ${visual}`;
  const period = explicitMatch(input.historicalPeriod || input.year, context, 15);
  const location = explicitMatch(input.location, context, 15);
  const character = input.characterId ? explicitMatch(input.characterId, visual, 15) : 15;
  const overlap = semanticOverlap(input.narration, visual);
  const conceptMatch = semanticConceptMatch(input.narration, visual);
  const productRoleMatch = Boolean(
    input.watchReference &&
      input.productPhotoRole &&
      PRODUCT_ROLE_PATTERNS[input.productPhotoRole]?.test(input.narration),
  );
  const actionAndSubject = Math.max(
    Math.round(25 * Math.min(1, overlap * 2.3)),
    conceptMatch || productRoleMatch ? 21 : 0,
  );
  const productConnection = input.watchReference
    ? input.productPhotoRole ||
      /時計|watch|dial|case|movement|文字盤|刻印|ムーブメント/iu.test(visual)
      ? 20
      : 8
    : input.visualType === "product_photo"
      ? 5
      : 20;
  const narrationMatch = Math.max(
    Math.round(10 * Math.min(1, overlap * 2.8)),
    conceptMatch || productRoleMatch ? 8 : 0,
  );
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
