type KeyframeScene = {
  order: number;
  preset: string;
  title: string;
  visualDescription: string;
  visualPrompt: string;
  camera: string;
  shotType: string;
  lighting: string;
  colorMood: string;
  year: string | null;
  location: string | null;
  historicalPeriod?: string | null;
  characterId?: string | null;
};

type ProjectStoryContext = {
  title: string;
  script: string;
};

export const ANIMATION_STYLE_BIBLE = [
  "professional cinematic editorial illustration by a senior luxury illustrator",
  "hand-crafted editorial drawing, sophisticated linework, controlled painterly shading, coherent ink-and-gouache texture",
  "muted archival palette, warm motivated light, subtle film grain, elegant 9:16 composition",
  "mature premium historical-documentary finish with consistent anatomy and era-authentic production design",
  "never pure photorealism, 3D CG, cheap anime, cartoon, fantasy, game art, glossy stock imagery, or synthetic plastic skin",
].join(", ");

export const CINEMATIC_REAL_STYLE_BIBLE = [
  "premium cinematic documentary still photographed for a luxury watch film",
  "photorealistic people and environments, natural skin and hands, restrained period-authentic production design",
  "motivated practical light, subtle film grain, elegant depth, sophisticated archival color, vertical 9:16 composition",
  "mature and understated, never glossy stock photography, cheap AI imagery, fantasy, cartoon, game CG, or excessive 3D",
].join(", ");

export const CHARACTER_BIBLES = {
  CHAR_01:
    "same Omani man, age 52, calm authoritative expression, neatly trimmed dark beard with subtle grey, cream dishdasha, dark gold-trimmed bisht, ivory-and-sand Omani turban, medium build, closed mouth",
  CHAR_02:
    "same British luxury jeweller, age 54, composed expression, swept dark-grey hair, clean-shaven, charcoal three-piece 1970s suit, white shirt, muted burgundy tie, medium build, closed mouth",
} as const;

export type CharacterKey = keyof typeof CHARACTER_BIBLES;

function isGoldKhanjarStory(project: ProjectStoryContext) {
  return /gold\s*khanjar|khanjar|カンジャル|オマーン|oman/iu.test(
    `${project.title} ${project.script}`,
  );
}

export function characterBibleForProject(
  characterKey: CharacterKey,
  project: ProjectStoryContext,
  scene?: Pick<KeyframeScene, "location" | "year" | "historicalPeriod">,
) {
  if (isGoldKhanjarStory(project)) return CHARACTER_BIBLES[characterKey];
  const era =
    scene?.historicalPeriod ||
    scene?.year ||
    "the historically accurate period stated by the story";
  const location = scene?.location || "the location stated by the story";
  if (characterKey === "CHAR_02")
    return `same supporting historical professional, age 48 to 58, composed closed-mouth expression, restrained era-authentic clothing for ${era} in ${location}, consistent face, hair, build and wardrobe, no culturally unrelated dress`;
  return `same central historical watchmaking character, age 48 to 58, calm focused closed-mouth expression, restrained era-authentic clothing for ${era} in ${location}, consistent face, hair, build and wardrobe, no culturally unrelated dress`;
}

export function characterKeyForScene(
  scene: Pick<KeyframeScene, "preset" | "title" | "visualDescription">,
) {
  const value = `${scene.title} ${scene.visualDescription}`.toLowerCase();
  if (/(anonymous|unidentified|back view|rear view|無名|匿名|後ろ姿|顔を見せない)/iu.test(value))
    return null;
  if (
    !/(character|人物|功労|国王|外交|職人|jeweller|asprey|london|英国|ロンドン)/i.test(value) &&
    scene.preset !== "HistoricalCharacter"
  )
    return null;
  return /(asprey|london|英国|ロンドン|jeweller|workshop|工房)/i.test(value)
    ? "CHAR_02"
    : "CHAR_01";
}

export function buildCharacterReferencePrompt(
  characterKey: CharacterKey,
  project: ProjectStoryContext = { title: "Gold Khanjar", script: "Oman Gold Khanjar" },
  scene?: Pick<KeyframeScene, "location" | "year" | "historicalPeriod">,
  style: "animation" | "cinematic_real" = "animation",
) {
  return [
    style === "animation" ? ANIMATION_STYLE_BIBLE : CINEMATIC_REAL_STYLE_BIBLE,
    characterBibleForProject(characterKey, project, scene),
    "waist-up neutral character reference in the established story world, three-quarter view, hands relaxed and mostly out of frame, no speaking, no readable text, no logo, no watch, no jewellery product, vertical 9:16",
  ].join(". ");
}

export function buildAnimationKeyframePrompt(
  scene: KeyframeScene,
  characterKey: CharacterKey | null,
  project: ProjectStoryContext = { title: "Gold Khanjar", script: "Oman Gold Khanjar" },
  style: "animation" | "cinematic_real" = "animation",
) {
  return [
    style === "animation" ? ANIMATION_STYLE_BIBLE : CINEMATIC_REAL_STYLE_BIBLE,
    characterKey
      ? `Preserve the supplied ${characterKey} reference exactly: ${characterBibleForProject(characterKey, project, scene)}`
      : "No new identifiable lead character unless the story explicitly requires one",
    `Project story boundary: ${project.title}. Never import characters, clothing, geography, architecture, symbols, or visual language from another project.`,
    `Story scene ${scene.order}: ${scene.title}`,
    scene.visualDescription,
    scene.visualPrompt,
    `Camera: ${scene.camera}; shot: ${scene.shotType}; lighting: ${scene.lighting}; palette: ${scene.colorMood}`,
    scene.year ? `Era: ${scene.year}` : "",
    scene.location ? `Location: ${scene.location}` : "",
    "One shot, one clear action. Silent acting, closed mouth, restrained pose, natural hands. Leave safe margins for 9:16 social video.",
    "Do not show or invent a wristwatch, dial, hands, bezel, serial, engraving, movement, product evidence, readable brand, logo, crest, or readable text. Product imagery is composited separately from Human-provided originals.",
  ]
    .filter(Boolean)
    .join(". ");
}
