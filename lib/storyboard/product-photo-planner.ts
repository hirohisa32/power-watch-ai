export const PRODUCT_PHOTO_ROLES = [
  "front",
  "dial",
  "case",
  "side",
  "crown",
  "caseback",
  "movement",
  "engraving",
  "bracelet",
  "hero",
] as const;

export type ProductPhotoRole = (typeof PRODUCT_PHOTO_ROLES)[number];

const ROLE_PATTERNS: Array<[ProductPhotoRole, RegExp]> = [
  ["movement", /movement|calibre|caliber|ムーブメント|機械|機構/iu],
  ["caseback", /caseback|case back|裏蓋|裏ぶた/iu],
  ["engraving", /engraving|mark|serial|hallmark|刻印|銘|シリアル|品位/iu],
  ["crown", /crown|竜頭|リューズ/iu],
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
      pool.find((candidate) => candidate.role === requested) ??
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
