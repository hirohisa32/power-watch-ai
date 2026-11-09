export const PRODUCT_PHOTO_ROLES = [
  "full_watch",
  "front",
  "dial",
  "dial_macro",
  "case",
  "side_case",
  "side",
  "crown",
  "wrist_shot",
  "caseback",
  "movement",
  "movement_wide",
  "movement_detail",
  "regulator",
  "engraving",
  "hallmark",
  "fab_suisse",
  "clous_de_paris",
  "bracelet",
  "clasp",
  "serial",
  "hero",
  "other",
] as const;

export type ProductPhotoRole = (typeof PRODUCT_PHOTO_ROLES)[number];

export const PRODUCT_PHOTO_EVIDENCE_ROLES = [
  "caseback",
  "movement",
  "movement_wide",
  "movement_detail",
  "regulator",
  "engraving",
  "serial",
  "hallmark",
  "fab_suisse",
] as const satisfies readonly ProductPhotoRole[];

export const PRODUCT_PHOTO_DESIRE_ROLES = [
  "full_watch",
  "front",
  "dial",
  "dial_macro",
  "case",
  "side_case",
  "side",
  "crown",
  "clous_de_paris",
  "bracelet",
  "clasp",
  "wrist_shot",
  "hero",
] as const satisfies readonly ProductPhotoRole[];

export type ProductPhotoClass = "evidence" | "desire" | "support";

export function productPhotoClass(role: string | null | undefined): ProductPhotoClass {
  if (PRODUCT_PHOTO_EVIDENCE_ROLES.includes(role as (typeof PRODUCT_PHOTO_EVIDENCE_ROLES)[number]))
    return "evidence";
  if (PRODUCT_PHOTO_DESIRE_ROLES.includes(role as (typeof PRODUCT_PHOTO_DESIRE_ROLES)[number]))
    return "desire";
  return "support";
}

export function evaluateFinalProductArc(
  scenes: Array<{
    watchReference: boolean;
    productPhotoRole?: string | null;
    preferredAssetLabels?: string[];
  }>,
) {
  const tailSize = Math.max(1, Math.ceil(scenes.length * 0.2));
  const tail = scenes.slice(-tailSize);
  const productScenes = scenes.filter((scene) => scene.watchReference);
  const productTail = tail.filter((scene) => scene.watchReference);
  const desireCount = productTail.filter(
    (scene) => productPhotoClass(scene.productPhotoRole) === "desire",
  ).length;
  const finalProduct = [...scenes].reverse().find((scene) => scene.watchReference);
  const usedLabels = productScenes.flatMap(
    (scene) => scene.preferredAssetLabels?.slice(0, 1) ?? [],
  );
  const singlePhotoMode =
    productScenes.length <= 2 &&
    usedLabels.length === productScenes.length &&
    new Set(usedLabels).size === 1;
  return {
    tailSize,
    desireCount,
    evidenceCount: productTail.filter(
      (scene) => productPhotoClass(scene.productPhotoRole) === "evidence",
    ).length,
    finalProductClass: productPhotoClass(finalProduct?.productPhotoRole),
    singlePhotoMode,
    passed:
      Boolean(finalProduct) &&
      (singlePhotoMode ||
        (desireCount > 0 && productPhotoClass(finalProduct?.productPhotoRole) === "desire")),
  };
}

const ROLE_PATTERNS: Array<[ProductPhotoRole, RegExp]> = [
  ["wrist_shot", /wrist|worn|腕装着|着用/iu],
  ["dial_macro", /dial macro|文字盤マクロ|文字盤アップ|macro/iu],
  ["clasp", /clasp|バックル|クラスプ/iu],
  ["serial", /serial|シリアル/iu],
  ["regulator", /swan.?neck|regulator|緩急針|スワンネック/iu],
  [
    "movement_detail",
    /gold setting|bridge detail|シャトン|受け|ブリッジ|movement detail|機械造形/iu,
  ],
  ["movement_wide", /movement wide|movement全体|ムーブメント全体|calibre全体|caliber wide/iu],
  ["fab_suisse", /fab\s*suisse/iu],
  ["hallmark", /eagle|hallmark|イーグル|鷲|メーカーズマーク/iu],
  ["clous_de_paris", /clous\s*de\s*paris|クルー?ド・パリ/iu],
  ["movement", /movement|calibre|caliber|ムーブメント|機械|機構/iu],
  ["caseback", /caseback|case back|裏蓋|裏ぶた/iu],
  ["engraving", /engraving|mark|serial|hallmark|刻印|銘|シリアル|品位/iu],
  ["crown", /crown|竜頭|リューズ/iu],
  ["side_case", /side case|case profile|ケース側面/iu],
  ["side", /side|profile|側面/iu],
  ["bracelet", /bracelet|clasp|strap|ブレスレット|クラスプ|ベルト/iu],
  ["dial", /dial|hands|index|bezel|文字盤|針|インデックス|ベゼル|クルー?ド・パリ/iu],
  ["case", /case|ケース/iu],
  ["front", /front|正面/iu],
  ["hero", /hero|全体|全景|メイン/iu],
];

export function inferProductPhotoRole(label: string): ProductPhotoRole {
  return ROLE_PATTERNS.find(([, pattern]) => pattern.test(label))?.[0] ?? "other";
}

export function desiredProductPhotoRole(context: string): ProductPhotoRole {
  return ROLE_PATTERNS.find(([, pattern]) => pattern.test(context))?.[0] ?? "hero";
}

const ROLE_FALLBACKS: Record<ProductPhotoRole, ProductPhotoRole[]> = {
  full_watch: ["full_watch", "hero", "front", "dial", "case"],
  front: ["front", "hero", "dial", "case"],
  dial: ["dial", "front", "hero"],
  dial_macro: ["dial_macro", "dial", "front", "hero"],
  case: ["case", "side", "caseback", "front", "hero"],
  side_case: ["side_case", "side", "crown", "case", "hero"],
  side: ["side", "crown", "case", "hero"],
  crown: ["crown", "side", "case", "hero"],
  wrist_shot: ["wrist_shot", "full_watch", "hero", "front"],
  caseback: ["caseback", "engraving", "case", "side"],
  movement: ["movement", "caseback"],
  movement_wide: ["movement_wide", "movement", "caseback"],
  movement_detail: ["movement_detail", "movement", "regulator", "caseback"],
  regulator: ["regulator", "movement_detail", "movement", "caseback"],
  engraving: ["engraving", "caseback", "side", "case", "front"],
  hallmark: ["hallmark", "engraving", "caseback", "side"],
  fab_suisse: ["fab_suisse", "engraving", "dial", "movement", "caseback"],
  clous_de_paris: ["clous_de_paris", "dial", "front", "hero"],
  bracelet: ["bracelet", "side", "hero"],
  clasp: ["clasp", "bracelet", "side", "hero"],
  serial: ["serial", "engraving", "caseback", "movement_detail"],
  hero: ["hero", "front", "dial", "side"],
  other: ["other", "hero", "front", "dial"],
};

export type ProductPhotoAssetCandidate = {
  id?: string;
  label: string;
  humanLabel?: string | null;
  detectedRole?: string | null;
  detectionConfidence?: number | null;
  role?: string | null;
  humanLocked?: boolean | null;
  analysis?: Record<string, unknown> | null;
};

export function isProductPhotoRole(value: string | null | undefined): value is ProductPhotoRole {
  return PRODUCT_PHOTO_ROLES.includes(value as ProductPhotoRole);
}

type DetectionCandidate = {
  role: string;
  confidence: number;
  featureGatePassed: boolean;
};

function analysisCandidates(asset: ProductPhotoAssetCandidate): DetectionCandidate[] {
  const detection = asset.analysis?.roleDetection;
  if (!detection || typeof detection !== "object") return [];
  const candidates = (detection as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const value = candidate as Record<string, unknown>;
    const role = typeof value.role === "string" ? value.role : null;
    if (!isProductPhotoRole(role) || typeof value.confidence !== "number") return [];
    return [
      {
        role,
        confidence: value.confidence,
        featureGatePassed: value.featureGatePassed === true,
      },
    ];
  });
}

export function automaticDetectedRole(asset: ProductPhotoAssetCandidate): ProductPhotoRole | null {
  const hasHumanLabel =
    asset.humanLabel === undefined
      ? Boolean(asset.label.trim())
      : Boolean(asset.humanLabel?.trim());
  if (hasHumanLabel) return null;
  const candidates = analysisCandidates(asset)
    .filter((candidate) => candidate.featureGatePassed)
    .sort((left, right) => right.confidence - left.confidence);
  const top = candidates[0];
  const second = candidates[1];
  if (!top || top.confidence < 0.85) return null;
  if (second && top.confidence - second.confidence < 0.2) return null;
  return top.role as ProductPhotoRole;
}

/** Human lock > Human label > eligible AI suggestion > fallback. */
export function effectiveProductPhotoRole(asset: ProductPhotoAssetCandidate): ProductPhotoRole {
  if (asset.humanLocked && isProductPhotoRole(asset.role)) return asset.role;
  const humanLabel = asset.humanLabel === undefined ? asset.label : asset.humanLabel;
  if (humanLabel?.trim()) return inferProductPhotoRole(humanLabel);
  return automaticDetectedRole(asset) ?? inferProductPhotoRole(asset.label);
}

export function shouldUseProductEvidence(context: string) {
  return /スワンネック|シャトン|ムーブメント|ベゼル|クルー?ド・パリ|ケース|刻印|文字盤|裏蓋|リューズ|ブレスレット|caseback|movement|bezel|engraving/iu.test(
    context,
  );
}

export function planProductPhotoUsage<
  T extends {
    watchReference: boolean;
    preferredAssetLabels: string[];
    narration: string;
    visualIntent?: string;
    visualSubject?: string;
    storyPhase?: string | null;
  },
>(scenes: T[], availableLabels: string[]) {
  return planProductPhotoUsageWithAssets(
    scenes,
    availableLabels.map((label) => ({ label })),
  );
}

export function planProductPhotoUsageWithAssets<
  T extends {
    watchReference: boolean;
    preferredAssetLabels: string[];
    narration: string;
    productPhotoRole?: string | null;
    visualIntent?: string;
    visualSubject?: string;
    storyPhase?: string | null;
    preset?: string | null;
    visualType?: string | null;
    characterId?: string | null;
    historicalPeriod?: string | null;
    visualDescription?: string | null;
    visualPrompt?: string | null;
    camera?: string | null;
    shotType?: string | null;
    lighting?: string | null;
    motion?: string | null;
    transition?: string | null;
  },
>(
  scenes: T[],
  assets: ProductPhotoAssetCandidate[],
): Array<T & { productPhotoRole: ProductPhotoRole | null }> {
  const candidates = assets.map((asset) => ({
    label: asset.label,
    role: effectiveProductPhotoRole(asset),
  }));
  if (candidates.length === 1) return planSingleProductPhotoUsage(scenes, candidates[0]);
  const useCounts = new Map<string, number>();
  let previousLabel: string | null = null;
  let previousRole: ProductPhotoRole | null = null;
  let roleRun = 0;
  return scenes.map((scene) => {
    if (!scene.watchReference || !candidates.length)
      return { ...scene, preferredAssetLabels: [], productPhotoRole: null };
    const requested = desiredProductPhotoRole(
      `${scene.narration} ${scene.visualIntent ?? ""} ${scene.visualSubject ?? ""}`,
    );
    const context = `${scene.narration} ${scene.visualIntent ?? ""} ${scene.visualSubject ?? ""} ${scene.storyPhase ?? ""}`;
    const fallbacks = ROLE_FALLBACKS[requested];
    const ranked = candidates
      .map((candidate) => {
        const fallbackRank = fallbacks.indexOf(candidate.role);
        const roleScore = fallbackRank < 0 ? 0 : 60 - fallbackRank * 8;
        const preferredScore = scene.preferredAssetLabels.includes(candidate.label) ? 12 : 0;
        const repeatPenalty = candidate.label === previousLabel ? 100 : 0;
        const roleRunPenalty = candidate.role === previousRole && roleRun >= 2 ? 25 : 0;
        const usagePenalty = (useCounts.get(candidate.label) ?? 0) * 8;
        const heroScore =
          requested === "hero" && ["hero", "full_watch", "front"].includes(candidate.role) ? 15 : 0;
        const evidenceScore =
          shouldUseProductEvidence(context) && productPhotoClass(candidate.role) === "evidence"
            ? 8
            : 0;
        return {
          ...candidate,
          score:
            roleScore +
            preferredScore +
            heroScore +
            evidenceScore -
            repeatPenalty -
            roleRunPenalty -
            usagePenalty,
        };
      })
      .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
    const selected = ranked[0] ?? candidates[0];
    roleRun = selected.role === previousRole ? roleRun + 1 : 1;
    previousRole = selected.role;
    previousLabel = selected.label;
    useCounts.set(selected.label, (useCounts.get(selected.label) ?? 0) + 1);
    return {
      ...scene,
      preferredAssetLabels: [selected.label],
      productPhotoRole: selected.role,
    };
  }) as Array<T & { productPhotoRole: ProductPhotoRole | null }>;
}

const PRODUCT_SCENE_PRESETS = new Set(["WatchReveal", "WristShot", "WatchMacro", "ProductHero"]);

function planSingleProductPhotoUsage<
  T extends {
    watchReference: boolean;
    preferredAssetLabels: string[];
    narration: string;
    productPhotoRole?: string | null;
    visualIntent?: string;
    visualSubject?: string;
    storyPhase?: string | null;
    preset?: string | null;
    visualType?: string | null;
    characterId?: string | null;
    historicalPeriod?: string | null;
    visualDescription?: string | null;
    visualPrompt?: string | null;
    camera?: string | null;
    shotType?: string | null;
    lighting?: string | null;
    motion?: string | null;
    transition?: string | null;
  },
>(
  scenes: T[],
  asset: { label: string; role: ProductPhotoRole },
): Array<T & { productPhotoRole: ProductPhotoRole | null }> {
  const timeline = scenes
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene }) => !["Opening", "Ending"].includes(scene.preset ?? ""));
  const heroIndex = timeline.at(-1)?.index;
  if (heroIndex === undefined)
    return scenes.map((scene) => ({
      ...scene,
      productPhotoRole: isProductPhotoRole(scene.productPhotoRole) ? scene.productPhotoRole : null,
    }));

  const middleTarget = Math.round((timeline[0].index + heroIndex) * 0.55);
  const evidenceIndex = timeline
    .filter(({ index }) => index < heroIndex - 1)
    .sort((left, right) => {
      const distance = Math.abs(left.index - middleTarget) - Math.abs(right.index - middleTarget);
      if (distance !== 0) return distance;
      return Number(right.scene.watchReference) - Number(left.scene.watchReference);
    })[0]?.index;
  const selected = new Set(
    [evidenceIndex, heroIndex].filter((index): index is number => index !== undefined),
  );

  return scenes.map((scene, index) => {
    if (selected.has(index)) {
      const isHero = index === heroIndex;
      const purpose = isHero ? "物語終盤のHero / Payoff" : "物語中盤のEvidence";
      return {
        ...scene,
        preset: isHero ? "ProductHero" : "WatchReveal",
        watchReference: true,
        preferredAssetLabels: [asset.label],
        productPhotoRole: asset.role,
        visualType: "product_photo",
        visualIntent: `${scene.narration}を、登録済みの同一商品写真による${purpose}として示す。`,
        visualSubject: `登録写真「${asset.label}」の実物時計`,
        visualDescription: `${asset.label}の元写真をそのまま使用する${purpose}。別の用途や別アングルを作らない。`,
        visualPrompt:
          "Use the exact registered product photograph without redrawing, restyling, reconstructing, morphing, generative fill, angle invention, or identity changes. Preserve the original frame and every visible watch detail. Add only restrained camera crop, focus, light, depth, and grain.",
        camera: isHero
          ? "Slow final hero dolly within the original frame"
          : "Restrained evidence push",
        shotType: isHero ? "Original-photo hero payoff" : "Original-photo documentary evidence",
        lighting: "Non-generative light overlay matched to the original photograph",
        motion: "Camera, focus, light and grain only; the watch geometry remains locked",
        transition: isHero ? "Quiet fade into the ending" : "Documentary match dissolve",
      };
    }

    const wasProductScene =
      scene.watchReference ||
      scene.visualType === "product_photo" ||
      PRODUCT_SCENE_PRESETS.has(scene.preset ?? "");
    if (!wasProductScene) return { ...scene, preferredAssetLabels: [], productPhotoRole: null };

    const characterScene = Boolean(scene.characterId);
    return {
      ...scene,
      preset: characterScene ? "HistoricalCharacter" : "HistoricalEvent",
      watchReference: false,
      preferredAssetLabels: [],
      productPhotoRole: null,
      visualType: "story",
      visualIntent: `${scene.narration}の意味を、時計本体を映さない人物・時代・資料のStory Sceneで補強する。`,
      visualSubject: characterScene
        ? "物語の中心人物によるSilent Acting"
        : scene.historicalPeriod
          ? `${scene.historicalPeriod}の歴史背景`
          : "物語を支える歴史資料と環境",
      visualDescription:
        "商品写真や時計本体を映さず、人物、工房、資料、建築または時代背景だけで物語をつなぐ。",
      visualPrompt:
        "Cinematic story scene matching the approved project style and historical context. Show only people, workshop, archival material, architecture, or environment. No watch, dial, case, movement, product photograph, logo, readable text, or invented product angle.",
      camera: "Measured documentary camera movement",
      shotType: characterScene
        ? "Silent character story beat"
        : "Historical environment story beat",
      motion: "One restrained story action with environmental movement",
    };
  }) as Array<T & { productPhotoRole: ProductPhotoRole | null }>;
}
