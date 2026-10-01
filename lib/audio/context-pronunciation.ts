export type ContextPronunciationRule = {
  id?: string;
  targetTerm: string;
  displayPattern: string;
  ttsTemplate: string;
  semanticPolicy: "same_meaning_only";
  status: "pending" | "approved" | "rejected";
};

export type AppliedContextRule = {
  ruleId?: string;
  targetTerm: string;
  displayPattern: string;
  ttsTemplate: string;
  source: "context_pronunciation_rule";
  semanticPolicy: "same_meaning_only";
};

export function applyApprovedContextRules(
  displayScript: string,
  rules: readonly ContextPronunciationRule[],
) {
  let ttsInputText = displayScript;
  const applied: AppliedContextRule[] = [];
  for (const rule of rules) {
    if (rule.status !== "approved" || !ttsInputText.includes(rule.displayPattern)) continue;
    ttsInputText = ttsInputText.replaceAll(rule.displayPattern, rule.ttsTemplate);
    applied.push({
      ruleId: rule.id,
      targetTerm: rule.targetTerm,
      displayPattern: rule.displayPattern,
      ttsTemplate: rule.ttsTemplate,
      source: "context_pronunciation_rule",
      semanticPolicy: "same_meaning_only",
    });
  }
  return { ttsInputText, applied };
}

export function buildContextAwareTtsInput(
  displayScript: string,
  rules: readonly ContextPronunciationRule[],
  applyDictionary: (value: string) => { ttsInputText: string; applied: Array<Record<string, unknown>> },
) {
  const context = applyApprovedContextRules(displayScript, rules);
  const reading = applyDictionary(context.ttsInputText);
  return {
    displayScript,
    ttsInputText: reading.ttsInputText,
    contextRules: context.applied,
    readingMap: reading.applied,
    qualityGateRequired: context.applied.length > 0,
    semanticPolicy: "same_meaning_only" as const,
  };
}

export type ContextRewriteAssessment = {
  sameMeaning: boolean;
  factsAdded: boolean;
  factsRemoved: boolean;
  exaggerated: boolean;
};

export function acceptContextRewriteCandidate(
  displayScript: string,
  candidate: string,
  assessment: ContextRewriteAssessment,
) {
  const accepted = Boolean(candidate.trim())
    && candidate !== displayScript
    && assessment.sameMeaning
    && !assessment.factsAdded
    && !assessment.factsRemoved
    && !assessment.exaggerated;
  return {
    accepted,
    displayScript,
    ttsInputText: accepted ? candidate : displayScript,
    nextStep: accepted ? "regenerate_then_quality_gate" as const : "human_review" as const,
    policy: ["no_fact_addition", "no_meaning_change", "no_exaggeration", "no_content_removal"] as const,
  };
}

export const CONTEXT_TTS_REMEDIATION_ORDER = [
  "pronunciation_dictionary",
  "approved_context_rule",
  "meaning_preserving_ai_rewrite",
  "regenerate",
  "quality_gate",
] as const;
