export const STORY_PHASES = ["hook", "context", "reason", "evidence", "reveal", "payoff"] as const;

export type StoryPhase = (typeof STORY_PHASES)[number];

export type StoryQualityScores = {
  hook: number;
  causality: number;
  continuity: number;
  emotionalProgression: number;
  productRelevance: number;
  payoff: number;
  purchaseDesire: number;
  average: number;
  status: "pass" | "review" | "ng";
};

export type StoryQualityScene = {
  storyPhase?: string | null;
  narration: string;
  watchReference: boolean;
  productPhotoRole?: string | null;
};

export function evaluateStoryQuality(scenes: StoryQualityScene[]): StoryQualityScores {
  const active = scenes.filter((scene) => scene.narration.trim());
  const phases = active.map((scene) => scene.storyPhase).filter(Boolean);
  const storyText = active.map((scene) => scene.narration).join(" ");
  const first = active[0];
  const last = active.at(-1);
  const productScenes = active.filter((scene) => scene.watchReference);
  const uniqueRoles = new Set(productScenes.map((scene) => scene.productPhotoRole).filter(Boolean));
  const hasOrderedArc = orderedSubsequence(phases, STORY_PHASES);
  const productArc = evaluateFinalProductArc(active);

  const hook = clamp(
    72 +
      (first?.storyPhase === "hook" ? 12 : 0) +
      (/(19|20)\d{2}|calib(?:re|er)|キャリバー|名機/iu.test(first?.narration ?? "") ? 10 : 0),
  );
  const causality = clamp(
    70 +
      (hasOrderedArc ? 14 : 0) +
      (/だから|その|証|出自|歴史|源流|つなが/iu.test(storyText) ? 10 : 0),
  );
  const continuity = clamp(
    70 + (hasOrderedArc ? 16 : 0) + (active.length >= 6 && active.length <= 12 ? 8 : 0),
  );
  const emotionalProgression = clamp(
    68 +
      (phases.includes("evidence") && phases.includes("reveal") ? 10 : 0) +
      (phases.includes("payoff") ? 10 : 0) +
      (/美|特別|時代|証|宿す|まとう/iu.test(last?.narration ?? "") ? 7 : 0),
  );
  const productRelevance = clamp(
    68 + Math.min(18, productScenes.length * 3) + Math.min(12, uniqueRoles.size * 2),
  );
  const payoff = clamp(
    68 +
      (last?.storyPhase === "payoff" ? 14 : 0) +
      (last?.watchReference ? 8 : 0) +
      (/特別|この一本|そのすべて|歴史|証/iu.test(last?.narration ?? "") ? 8 : 0),
  );
  const purchaseDesire = clamp(
    54 +
      Math.min(12, uniqueRoles.size * 2) +
      (phases.includes("reveal") ? 7 : 0) +
      (last?.storyPhase === "payoff" ? 8 : 0) +
      (/特別|美し|宿す|まとう|この一本/iu.test(last?.narration ?? "") ? 8 : 0) +
      (productArc.desireCount > 0 ? 7 : 0) +
      (productArc.finalProductClass === "desire" ? 7 : 0),
  );
  const values = [
    hook,
    causality,
    continuity,
    emotionalProgression,
    productRelevance,
    payoff,
    purchaseDesire,
  ];
  const average = Number(
    (values.reduce((sum, score) => sum + score, 0) / values.length).toFixed(1),
  );
  const status = purchaseDesire < 80 || average < 80 ? "ng" : average < 85 ? "review" : "pass";
  return {
    hook,
    causality,
    continuity,
    emotionalProgression,
    productRelevance,
    payoff,
    purchaseDesire,
    average,
    status,
  };
}

export function assertStoryQuality(scores: StoryQualityScores) {
  if (scores.purchaseDesire < 80) throw new Error("PURCHASE_DESIRE_NG");
  if (scores.average < 85) throw new Error("STORY_QUALITY_NG");
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function orderedSubsequence(values: Array<string | null | undefined>, expected: readonly string[]) {
  let cursor = 0;
  for (const value of values) if (value === expected[cursor]) cursor += 1;
  return cursor === expected.length;
}
import { evaluateFinalProductArc } from "./product-photo-planner";
