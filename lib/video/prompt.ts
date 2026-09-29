export type VideoPromptScene = {
  preset?: string;
  title?: string;
  visualDescription?: string;
  visualPrompt: string;
  camera: string;
  shotType: string;
  lighting: string;
  motion: string;
  colorMood: string;
  transition?: string;
  duration: number;
  watchReference: boolean;
  preferredAssetLabels: string[];
  referenceAvailable?: boolean;
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
      ? "Premium cinematic animation; coherent materials and a restrained luxury finish."
      : "Photorealistic premium cinema; accurate materials and restrained luxury grading.";
  const productConstraint = scene.watchReference
    ? scene.referenceAvailable !== false
      ? `The supplied watch image is the exact product identity and first frame (${short(scene.preferredAssetLabels.join(", ") || "registered watch", 40)}). Preserve exactly its dial layout, indices, hands, logo, bezel, case, crown, proportions, material, strap and color. Move only camera, light, focus, reflection or hands. Do not redesign, invent, distort, mirror, relabel or add text.`
      : "No real watch reference is available. Do not invent a precise frontal watch or readable dial. Show only silhouette, partial detail, reflection, a dark reveal, a distant wrist, or environmental implication so product identity is not fabricated."
    : "Do not introduce readable logos, watermarks, captions, or interface text.";
  const presetQuality = scene.preset ? QUALITY_BY_PRESET[scene.preset] : undefined;
  const direction = [
    productConstraint,
    regenerationInstruction ? `Revision instruction: ${short(regenerationInstruction, 100)}` : "",
    presetQuality,
    styleDirection,
    `Camera: ${short(scene.camera, 40)}; shot: ${short(scene.shotType, 40)}; light: ${short(scene.lighting, 40)}; motion: ${short(scene.motion, 40)}; color: ${short(scene.colorMood, 40)}; ${scene.duration} seconds.`,
    scene.transition ? `End transition: ${short(scene.transition, 48)}.` : "",
    scene.preset === "HistoricalCharacter"
      ? `Character key: ${short(`${scene.title ?? "recurring character"}; ${scene.visualDescription ?? ""}`, 80)}. Keep face, age, hair, build, wardrobe and palette identical.`
      : "",
    "Keep continuity. One controlled move; no flicker, warping, duplicate limbs, jump cuts, subtitles, title cards or scene labels.",
  ]
    .filter(Boolean)
    .join(" ");
  // Runway caps promptText at 1,000 UTF-16 units. Keep all control and product
  // identity clauses intact, then use the remaining budget for the visual prompt.
  const visualBudget = Math.max(0, 999 - direction.length);
  const visual = short(scene.visualPrompt, visualBudget);
  return `${visual}${visual ? " " : ""}${direction}`.slice(0, 1000);
}
