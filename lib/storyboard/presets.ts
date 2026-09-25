export const PRESET_NAMES = [
  "Opening",
  "VintageRoom",
  "OldBook",
  "WatchReveal",
  "HistoricalCharacter",
  "HistoricalEvent",
  "Racing",
  "CityEraEstablishing",
  "WristShot",
  "WatchMacro",
  "ProductHero",
  "YearLocationTitle",
  "Ending",
] as const;

export type ScenePresetName = (typeof PRESET_NAMES)[number];

export type ScenePresetDefinition = {
  camera: string;
  shotType: string;
  lighting: string;
  motion: string;
  colorMood: string;
  transition: string;
  watchReferencePolicy: string;
};

export const SCENE_PRESETS: Record<ScenePresetName, ScenePresetDefinition> = {
  Opening: {
    camera: "Measured dolly-in with locked, deliberate framing",
    shotType: "Atmospheric wide to tactile insert",
    lighting: "Low-key window shafts through suspended dust",
    motion: "Slow door movement, drifting dust, restrained page movement",
    colorMood: "Deep walnut, charcoal, aged parchment, muted gold",
    transition: "Match dissolve from book or moving watch hands into the story",
    watchReferencePolicy: "Use a real watch reference only for the reveal portion",
  },
  VintageRoom: {
    camera: "Slow lateral track at human eye level",
    shotType: "Wide environmental establishing shot",
    lighting: "Soft directional daylight with practical tungsten accents",
    motion: "Minimal parallax and atmospheric dust",
    colorMood: "Warm sepia, smoked brown, restrained blacks",
    transition: "Luma dissolve or slow cut on movement",
    watchReferencePolicy: "Normally no watch reference",
  },
  OldBook: {
    camera: "Controlled top-down push-in",
    shotType: "Detail insert and overhead close-up",
    lighting: "Raking warm light revealing paper and leather texture",
    motion: "Pages lift slowly in a natural draft",
    colorMood: "Aged ivory, leather brown, muted brass",
    transition: "Page wipe or match cut",
    watchReferencePolicy: "Use a reference only when the physical watch appears",
  },
  WatchReveal: {
    camera: "Slow precision arc around the product",
    shotType: "Luxury product close-up",
    lighting: "Sculpted edge light with controlled specular highlights",
    motion: "Subtle turntable feel or restrained camera orbit",
    colorMood: "Deep black, metal tones, selective muted gold",
    transition: "Elegant bloom or match cut on circular form",
    watchReferencePolicy: "Required; prioritize Front or 45 degree",
  },
  HistoricalCharacter: {
    camera: "Stable portrait framing with a gentle push-in",
    shotType: "Medium portrait or over-shoulder narrative shot",
    lighting: "Period-motivated soft key with cinematic contrast",
    motion: "Restrained body movement and natural cloth motion",
    colorMood: "Period-authentic muted palette with premium grading",
    transition: "Straight cut or soft dissolve",
    watchReferencePolicy: "Use Wrist only when the watch is visibly worn",
  },
  HistoricalEvent: {
    camera: "Composed observational movement",
    shotType: "Wide contextual shot with selective detail",
    lighting: "Historically plausible natural or practical lighting",
    motion: "Controlled environmental action without spectacle for its own sake",
    colorMood: "Era-authentic, desaturated editorial grade",
    transition: "Documentary cut or atmospheric dissolve",
    watchReferencePolicy: "Only when the watch is explicitly connected to the event",
  },
  Racing: {
    camera: "Low tracking angle with disciplined speed cues",
    shotType: "Dynamic wide, cockpit insert, or mechanical detail",
    lighting: "Hard daylight, track reflections, crisp contrast",
    motion: "Directional motion with limited blur and readable subject",
    colorMood: "Graphite, steel, period racing colors",
    transition: "Sound-led hard cut or motion match",
    watchReferencePolicy: "Use Wrist or Front when watch timing is shown",
  },
  CityEraEstablishing: {
    camera: "Slow crane, locked vista, or measured street-level track",
    shotType: "Wide establishing shot",
    lighting: "Time-of-day motivated atmospheric light",
    motion: "Subtle crowd, traffic, weather, or smoke movement",
    colorMood: "Historically grounded editorial palette",
    transition: "Slow dissolve into the next narrative beat",
    watchReferencePolicy: "No watch reference",
  },
  WristShot: {
    camera: "Stable close tracking aligned to the wrist",
    shotType: "Wrist close-up",
    lighting: "Soft luxury key with readable dial and controlled reflections",
    motion: "One simple wrist gesture with restrained camera follow",
    colorMood: "Natural skin, deep fabric, accurate watch materials",
    transition: "Cut on gesture",
    watchReferencePolicy: "Required; prioritize Wrist then 45 degree",
  },
  WatchMacro: {
    camera: "Locked macro rail movement",
    shotType: "Extreme macro detail",
    lighting: "Narrow raking light with crisp micro-contrast",
    motion: "Very slow focus pull or millimeter-scale slide",
    colorMood: "Accurate material color, rich blacks, fine highlights",
    transition: "Macro match cut",
    watchReferencePolicy: "Required; prioritize Dial Macro, Side, or Caseback",
  },
  ProductHero: {
    camera: "Slow centered push or precise three-quarter orbit",
    shotType: "Hero product shot",
    lighting: "Premium studio lighting with sculpted rim and clean dial readability",
    motion: "Minimal, confident, product-led movement",
    colorMood: "Black, charcoal, true metal color, muted gold accents",
    transition: "Elegant fade or optical match",
    watchReferencePolicy: "Required; prioritize Front and 45 degree",
  },
  YearLocationTitle: {
    camera: "Locked composition with deliberate negative space",
    shotType: "Establishing plate for typography overlay",
    lighting: "Scene-motivated, uncluttered tonal separation",
    motion: "Subtle environmental movement only",
    colorMood: "Editorial and era-specific",
    transition: "Typography-led fade; text is added in post-production",
    watchReferencePolicy: "Normally no watch reference",
  },
  Ending: {
    camera: "Locked or nearly imperceptible push-in",
    shotType: "Final hero or brand end-card plate",
    lighting: "Controlled premium product light fading to black",
    motion: "Watch hands or a single restrained highlight movement",
    colorMood: "Deep black, charcoal, muted gold",
    transition: "Fade to black with clean overlay-safe negative space",
    watchReferencePolicy: "Required when the watch remains on screen",
  },
};

export function serializePresetGuide() {
  return Object.entries(SCENE_PRESETS)
    .map(
      ([name, preset]) =>
        `${name}: camera=${preset.camera}; shot=${preset.shotType}; lighting=${preset.lighting}; motion=${preset.motion}; color=${preset.colorMood}; transition=${preset.transition}; reference=${preset.watchReferencePolicy}`,
    )
    .join("\n");
}
