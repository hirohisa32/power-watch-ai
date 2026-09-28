export type VideoPromptScene = {
  preset?: string;
  visualPrompt: string;
  camera: string;
  shotType: string;
  lighting: string;
  motion: string;
  colorMood: string;
  duration: number;
  watchReference: boolean;
  preferredAssetLabels: string[];
};

const QUALITY_BY_PRESET: Record<string, string> = {
  Opening:
    "One deliberate reveal, tactile atmosphere, clean negative space for the POWER WATCH overlay.",
  HistoricalCharacter:
    "Keep one identifiable character, period-correct wardrobe and anatomy, with restrained documentary performance.",
  Racing:
    "One readable direction of travel, stable vehicle identity, controlled motion blur, period-correct track details.",
  WristShot:
    "Natural hand anatomy and one simple wrist gesture; keep the referenced watch face unobstructed and sharp.",
  WatchMacro:
    "Optically credible macro depth of field; preserve the referenced dial geometry and mechanical details without morphing.",
  ProductHero:
    "Immaculate luxury product composition, stable silhouette, accurate reflections, readable dial, no geometry drift.",
  Ending:
    "Confident final product hold with overlay-safe negative space and a restrained fade to black.",
};

export function buildVideoPrompt(
  scene: VideoPromptScene,
  style: "cinematic_real" | "animation",
  regenerationInstruction?: string,
) {
  const short = (value: string, max: number) => value.slice(0, max);
  const styleDirection =
    style === "animation"
      ? "Premium cinematic animation with coherent materials and a polished commercial finish."
      : "Photorealistic premium cinema with accurate materials, reflections, and restrained luxury grading.";
  const productConstraint = scene.watchReference
    ? `The supplied watch is the exact product identity reference (${short(scene.preferredAssetLabels.join(", ") || "registered watch", 40)}). Preserve exactly its dial layout, indices, hands, logo placement, bezel, case, crown, proportions, materials, strap or bracelet, colors, and engravings. Do not redesign, invent, replace, distort, mirror, relabel, or add text.`
    : "Do not introduce readable logos, watermarks, captions, or interface text.";
  const presetQuality = scene.preset ? QUALITY_BY_PRESET[scene.preset] : undefined;
  const direction = [
    `Camera: ${short(scene.camera, 32)}. Shot: ${short(scene.shotType, 32)}.`,
    `Lighting: ${short(scene.lighting, 32)}. Motion: ${short(scene.motion, 32)}.`,
    `Color: ${short(scene.colorMood, 32)}. Duration: ${scene.duration} seconds.`,
    styleDirection,
    presetQuality,
    "Keep subject, wardrobe, environment, lens, lighting, and grade continuous. Use one controlled move; avoid flicker, warping, duplicate limbs, or jump cuts.",
    productConstraint,
    regenerationInstruction ? `Revision instruction: ${short(regenerationInstruction, 100)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  // Runway caps promptText at 1,000 UTF-16 units. Keep all control and product
  // identity clauses intact, then use the remaining budget for the visual prompt.
  const visualBudget = Math.max(30, 999 - direction.length);
  return `${short(scene.visualPrompt, visualBudget)} ${direction}`.slice(0, 1000);
}
