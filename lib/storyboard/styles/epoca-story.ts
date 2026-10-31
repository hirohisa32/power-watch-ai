import type { ScenePresetName } from "@/lib/storyboard/presets";

export type SceneDurationRule = {
  min: number;
  preferred: number;
  max: number;
};

/**
 * Direction distilled from the five supplied EPOCA / Principe Privé reference reels.
 * The source files are screen recordings, so this profile captures editorial decisions rather
 * than copying browser chrome, subtitles, logos, or any individual story.
 */
export const EPOCA_STORY_STYLE = {
  id: "epoca-story-v1",
  pacing: {
    observedShotRangeSeconds: [2.9, 4.1],
    hookWindowSeconds: [0, 4],
    productReturnIntervalSeconds: [8, 12],
    principle:
      "Alternate story context, a stable character beat, and a watch detail; earn longer holds only for emotional or product payoff.",
  },
  sceneDurationRules: {
    Opening: { min: 3, preferred: 4, max: 5 },
    VintageRoom: { min: 3, preferred: 4, max: 5 },
    OldBook: { min: 3, preferred: 4, max: 5 },
    WatchReveal: { min: 3, preferred: 4, max: 5 },
    HistoricalCharacter: { min: 3, preferred: 4, max: 6 },
    HistoricalEvent: { min: 3, preferred: 4, max: 5 },
    Racing: { min: 3, preferred: 4, max: 5 },
    CityEraEstablishing: { min: 3, preferred: 4, max: 5 },
    WristShot: { min: 3, preferred: 4, max: 5 },
    WatchMacro: { min: 3, preferred: 4, max: 5 },
    ProductHero: { min: 3, preferred: 5, max: 6 },
    YearLocationTitle: { min: 3, preferred: 3, max: 4 },
    Ending: { min: 3, preferred: 4, max: 5 },
  } satisfies Record<ScenePresetName, SceneDurationRule>,
  storyStructure: [
    "HOOK",
    "ERA_OR_WORLD",
    "CHARACTER",
    "EVENT",
    "WATCH_CONNECTION",
    "ORIGINAL_PRODUCT_EVIDENCE",
    "DETAIL_OR_EVIDENCE",
    "EMOTIONAL_PAYOFF",
  ],
  cameraRules: [
    "Use one legible camera move per shot: locked portrait, slow push, short lateral track, or precise macro slide.",
    "Reserve fast tracking for racing or urgent action and keep the subject readable.",
    "Match movement direction across adjacent shots when using a motion-matched cut.",
  ],
  framingRules: [
    "Alternate environmental wide, character medium/close portrait, and original-product evidence detail.",
    "Keep faces and the watch inside a 9:16 center-safe composition with clean subtitle space.",
    "Use negative space for year/location or brand overlays; never ask the video model to draw text.",
  ],
  lightingRules: [
    "Motivate light from windows, fire, workshop practicals, track daylight, or a controlled studio source.",
    "Use warm highlights and rich blacks without crushing dial details.",
    "Product shots need narrow edge light and stable, physically plausible reflections.",
  ],
  colorRules: [
    "Favor warm amber, walnut, parchment, charcoal, muted gold, steel, and restrained era colors.",
    "Keep one grade throughout a location and avoid oversaturation or modern neon unless the script requires it.",
  ],
  animationRules: [
    "Use mature cinematic illustration with stable facial proportions, hair, age, wardrobe, and skin tone.",
    "Animate small expressions, cloth, dust, fire, and camera parallax; avoid rubbery body motion.",
  ],
  productShotRules: [
    "Treat uploaded watch photographs as original product evidence and route them through the non-generative editorial-motion pipeline.",
    "Keep every original watch pixel and identity-critical dial, hands, indices, logo, bezel, case, crown, bracelet, engraving, serial, movement, patina and scratch unchanged.",
    "Animate only the editorial frame with crop/dolly, mask reveal, focus-style blur, light or reflection overlay, shadow, foreground depth, grain, match cut and text.",
    "Never redraw, stylize, reconstruct, morph, generatively fill, wear, hold or invent the product; without a real photograph, do not fabricate product evidence.",
  ],
  transitionRules: [
    "Straight and motion-matched cuts are the default.",
    "Use a short dissolve for memory or time change, a restrained light transition for reveal, and dust or page movement only when motivated.",
    "Do not fade every scene to black and do not stack decorative transitions.",
  ],
  subtitlePolicy: {
    source: "narration-only",
    maxLines: 2,
    targetCharactersPerLineJa: 22,
    safeArea: "centered above the lower Instagram controls",
    forbidden: ["scene title", "visual description", "prompt", "preset name", "internal label"],
  },
  narrationRules: [
    "Create one coherent documentary narration from the original script before distributing complete sentences across scenes.",
    "Use causal bridges and natural pauses; do not read scene descriptions, shot instructions, or internal labels.",
    "Keep a single narrator voice and avoid speed above 1.12 unless the user explicitly approves it.",
  ],
  audioRules: [
    "Narration is always foreground, selective diegetic SE is second, and music is third.",
    "Duck music under speech, use silence as punctuation, and place SE only on visible actions.",
  ],
  endingRules: [
    "Resolve the story body with one emotional sentence and an accurate original-photo watch hero.",
    "The selected ending is an external System Asset; do not generate a brand end card inside the storyboard.",
  ],
  luxuryStyleRules: [
    "Luxury comes from restraint, material accuracy, negative space, deliberate pacing, and controlled highlights.",
    "Prefer one confident detail over visual clutter and avoid exaggerated glow, particles, or synthetic camera shake.",
  ],
} as const;

export function sceneDurationRule(preset: ScenePresetName): SceneDurationRule {
  return EPOCA_STORY_STYLE.sceneDurationRules[preset];
}

export function serializeEpocaStoryStyle() {
  const style = EPOCA_STORY_STYLE;
  return [
    `Structure: ${style.storyStructure.join(" -> ")}`,
    `Pacing: observed ${style.pacing.observedShotRangeSeconds.join("-")}s shots; hook within ${style.pacing.hookWindowSeconds.join("-")}s; ${style.pacing.principle}`,
    `Camera: ${style.cameraRules.join(" ")}`,
    `Framing: ${style.framingRules.join(" ")}`,
    `Lighting: ${style.lightingRules.join(" ")}`,
    `Color: ${style.colorRules.join(" ")}`,
    `Animation: ${style.animationRules.join(" ")}`,
    `Product: ${style.productShotRules.join(" ")}`,
    `Transitions: ${style.transitionRules.join(" ")}`,
    `Narration: ${style.narrationRules.join(" ")}`,
    `Audio: ${style.audioRules.join(" ")}`,
    `Ending: ${style.endingRules.join(" ")}`,
    `Luxury: ${style.luxuryStyleRules.join(" ")}`,
  ].join("\n");
}
