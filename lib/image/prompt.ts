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
};

export const ANIMATION_STYLE_BIBLE = [
  "professional cinematic editorial animation by a senior luxury illustrator",
  "restrained hand-painted detail, coherent ink-and-gouache texture, premium documentary finish",
  "muted archival palette, warm motivated light, subtle film grain, elegant 9:16 composition",
  "consistent anatomy and era-authentic production design, never cartoonish or game-like",
].join(", ");

export const CINEMATIC_REAL_STYLE_BIBLE = [
  "premium cinematic documentary still photographed for a luxury watch film",
  "photorealistic people and environments, natural skin and hands, restrained period-authentic production design",
  "motivated practical light, subtle film grain, elegant depth, sophisticated archival color, vertical 9:16 composition",
  "mature and understated, never glossy stock photography, cheap AI imagery, fantasy, cartoon, game CG, or excessive 3D",
].join(", ");

export const CHARACTER_BIBLES = {
  CHAR_01: "same Omani man, age 52, calm authoritative expression, neatly trimmed dark beard with subtle grey, cream dishdasha, dark gold-trimmed bisht, ivory-and-sand Omani turban, medium build, closed mouth",
  CHAR_02: "same British luxury jeweller, age 54, composed expression, swept dark-grey hair, clean-shaven, charcoal three-piece 1970s suit, white shirt, muted burgundy tie, medium build, closed mouth",
} as const;

export function characterKeyForScene(scene: Pick<KeyframeScene, "preset" | "title" | "visualDescription">) {
  const value = `${scene.title} ${scene.visualDescription}`.toLowerCase();
  if (!/(character|人物|功労|国王|外交|職人|jeweller|asprey|london|英国|ロンドン)/i.test(value) && scene.preset !== "HistoricalCharacter") return null;
  return /(asprey|london|英国|ロンドン|jeweller|workshop|工房)/i.test(value) ? "CHAR_02" : "CHAR_01";
}

export function buildCharacterReferencePrompt(
  characterKey: keyof typeof CHARACTER_BIBLES,
  style: "animation" | "cinematic_real" = "animation",
) {
  return [
    style === "animation" ? ANIMATION_STYLE_BIBLE : CINEMATIC_REAL_STYLE_BIBLE,
    CHARACTER_BIBLES[characterKey],
    "waist-up neutral character reference in the established story world, three-quarter view, hands relaxed and mostly out of frame, no speaking, no readable text, no logo, no watch, no jewellery product, vertical 9:16",
  ].join(". ");
}

export function buildAnimationKeyframePrompt(
  scene: KeyframeScene,
  characterKey: keyof typeof CHARACTER_BIBLES | null,
  style: "animation" | "cinematic_real" = "animation",
) {
  return [
    style === "animation" ? ANIMATION_STYLE_BIBLE : CINEMATIC_REAL_STYLE_BIBLE,
    characterKey ? `Preserve the supplied ${characterKey} reference exactly: ${CHARACTER_BIBLES[characterKey]}` : "No new identifiable lead character unless the story explicitly requires one",
    `Story scene ${scene.order}: ${scene.title}`,
    scene.visualDescription,
    scene.visualPrompt,
    `Camera: ${scene.camera}; shot: ${scene.shotType}; lighting: ${scene.lighting}; palette: ${scene.colorMood}`,
    scene.year ? `Era: ${scene.year}` : "",
    scene.location ? `Location: ${scene.location}` : "",
    "One shot, one clear action. Silent acting, closed mouth, restrained pose, natural hands. Leave safe margins for 9:16 social video.",
    "Do not show or invent a wristwatch, dial, hands, bezel, serial, engraving, movement, product evidence, readable brand, logo, crest, or readable text. Product imagery is composited separately from Human-provided originals.",
  ].filter(Boolean).join(". ");
}
