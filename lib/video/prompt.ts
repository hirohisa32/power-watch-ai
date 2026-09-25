export type VideoPromptScene = {
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

export function buildVideoPrompt(
  scene: VideoPromptScene,
  style: "cinematic_real" | "animation",
  regenerationInstruction?: string,
) {
  const short = (value: string, max: number) => value.slice(0, max);
  const styleDirection =
    style === "animation"
      ? "Premium cinematic animation, coherent illustrated materials, controlled stylization, polished commercial finish."
      : "Photorealistic premium cinema, physically accurate materials and reflections, restrained luxury watch commercial finish.";
  const productConstraint = scene.watchReference
    ? `The supplied watch is the exact product identity reference (${short(scene.preferredAssetLabels.join(", ") || "registered watch", 40)}). Preserve exactly its dial layout, indices, hands, logo placement, bezel, crown, case proportions, materials, strap or bracelet, colors, engravings, and distinctive details. Do not redesign, invent, replace, distort, mirror, relabel, or add text.`
    : "Do not introduce readable logos, watermarks, captions, or interface text.";
  const direction = [
    `Camera: ${short(scene.camera, 45)}. Shot: ${short(scene.shotType, 45)}.`,
    `Lighting: ${short(scene.lighting, 45)}. Motion: ${short(scene.motion, 45)}.`,
    `Color and mood: ${short(scene.colorMood, 45)}. Duration: ${scene.duration} seconds.`,
    styleDirection,
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
