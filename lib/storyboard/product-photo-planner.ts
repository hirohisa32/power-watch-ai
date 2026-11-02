export const PRODUCT_PHOTO_ROLES = [
  "full_watch",
  "front",
  "dial",
  "case",
  "side_case",
  "side",
  "crown",
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
  "hero",
] as const;

export type ProductPhotoRole = (typeof PRODUCT_PHOTO_ROLES)[number];

export const PRODUCT_PHOTO_EVIDENCE_ROLES = [
  "caseback",
  "movement",
  "movement_wide",
  "movement_detail",
  "regulator",
  "engraving",
  "hallmark",
  "fab_suisse",
] as const satisfies readonly ProductPhotoRole[];

export const PRODUCT_PHOTO_DESIRE_ROLES = [
  "full_watch",
  "front",
  "dial",
  "case",
  "side_case",
  "side",
  "crown",
  "clous_de_paris",
  "bracelet",
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
  scenes: Array<{ watchReference: boolean; productPhotoRole?: string | null }>,
) {
  const tailSize = Math.max(1, Math.ceil(scenes.length * 0.2));
  const tail = scenes.slice(-tailSize);
  const productTail = tail.filter((scene) => scene.watchReference);
  const desireCount = productTail.filter(
    (scene) => productPhotoClass(scene.productPhotoRole) === "desire",
  ).length;
  const finalProduct = [...scenes].reverse().find((scene) => scene.watchReference);
  return {
    tailSize,
    desireCount,
    evidenceCount: productTail.filter(
      (scene) => productPhotoClass(scene.productPhotoRole) === "evidence",
    ).length,
    finalProductClass: productPhotoClass(finalProduct?.productPhotoRole),
    passed: desireCount > 0 && productPhotoClass(finalProduct?.productPhotoRole) === "desire",
  };
}

const ROLE_PATTERNS: Array<[ProductPhotoRole, RegExp]> = [
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
  return ROLE_PATTERNS.find(([, pattern]) => pattern.test(label))?.[0] ?? "hero";
}

export function desiredProductPhotoRole(context: string): ProductPhotoRole {
  return ROLE_PATTERNS.find(([, pattern]) => pattern.test(context))?.[0] ?? "hero";
}

const ROLE_FALLBACKS: Record<ProductPhotoRole, ProductPhotoRole[]> = {
  full_watch: ["full_watch", "hero", "front", "dial", "case"],
  front: ["front", "hero", "dial", "case"],
  dial: ["dial", "front", "hero"],
  case: ["case", "side", "caseback", "front", "hero"],
  side_case: ["side_case", "side", "crown", "case", "hero"],
  side: ["side", "crown", "case", "hero"],
  crown: ["crown", "side", "case", "hero"],
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
  hero: ["hero", "front", "dial", "side"],
};

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
  },
>(scenes: T[], availableLabels: string[]) {
  const candidates = availableLabels.map((label) => ({
    label,
    role: inferProductPhotoRole(label),
  }));
  let previousLabel: string | null = null;
  let previousRole: ProductPhotoRole | null = null;
  let roleRun = 0;
  return scenes.map((scene) => {
    if (!scene.watchReference || !candidates.length)
      return { ...scene, preferredAssetLabels: [], productPhotoRole: null };
    const requested = desiredProductPhotoRole(
      `${scene.narration} ${scene.visualIntent ?? ""} ${scene.visualSubject ?? ""}`,
    );
    const permitted = candidates.filter(
      (candidate) =>
        candidate.label !== previousLabel && !(candidate.role === previousRole && roleRun >= 2),
    );
    const pool = permitted.length
      ? permitted
      : candidates.filter((candidate) => candidate.label !== previousLabel);
    const selected =
      ROLE_FALLBACKS[requested]
        .map((role) => pool.find((candidate) => candidate.role === role))
        .find(Boolean) ??
      pool.find((candidate) => scene.preferredAssetLabels.includes(candidate.label)) ??
      pool[0] ??
      candidates[0];
    roleRun = selected.role === previousRole ? roleRun + 1 : 1;
    previousRole = selected.role;
    previousLabel = selected.label;
    return {
      ...scene,
      preferredAssetLabels: [selected.label],
      productPhotoRole: selected.role,
    };
  });
}
