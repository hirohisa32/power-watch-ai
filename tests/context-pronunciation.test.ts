import { describe, expect, it } from "vitest";
import { acceptContextRewriteCandidate, applyApprovedContextRules, CONTEXT_TTS_REMEDIATION_ORDER } from "@/lib/audio/context-pronunciation";
import { OMAN_CONTEXT_TESTS, omanContextObjectKey } from "@/lib/audio/oman-context-preview";
import { VOICE_PREVIEW_OPTIONS } from "@/lib/audio/voice-preview";

describe("context pronunciation", () => {
  it("applies only Human-approved same-meaning rules", () => {
    const display = "1970年代、変革期のオマーン。";
    const approved = { id: "rule", targetTerm: "オマーン", displayPattern: display, ttsTemplate: "1970年代、変革期を迎えていた、オマーンという国。", semanticPolicy: "same_meaning_only" as const, status: "approved" as const };
    expect(applyApprovedContextRules(display, [approved]).ttsInputText).toBe(approved.ttsTemplate);
    expect(applyApprovedContextRules(display, [{ ...approved, status: "pending" }]).ttsInputText).toBe(display);
  });

  it("keeps the three approved local tests exact and isolated", () => {
    expect(OMAN_CONTEXT_TESTS).toHaveLength(3);
    expect(OMAN_CONTEXT_TESTS[0].ttsInputText).toBe("1970年代、変革期を迎えていた、オマーンという国。");
    expect(OMAN_CONTEXT_TESTS[1].displayScript).toBe(OMAN_CONTEXT_TESTS[1].ttsInputText);
    expect(omanContextObjectKey(VOICE_PREVIEW_OPTIONS[0].voiceId, "test-a", "raw")).toBe("system-assets/previews/oman-context/v1/voice-a/test-a/raw.mp3");
  });

  it("accepts AI contextualization only when meaning and facts are preserved", () => {
    const display = "変革期のオマーン。";
    const safe = acceptContextRewriteCandidate(display, "変革期を迎えていた、オマーンという国。", { sameMeaning: true, factsAdded: false, factsRemoved: false, exaggerated: false });
    const unsafe = acceptContextRewriteCandidate(display, "繁栄を極めた、オマーンという大国。", { sameMeaning: false, factsAdded: true, factsRemoved: false, exaggerated: true });
    expect(safe.accepted).toBe(true);
    expect(safe.nextStep).toBe("regenerate_then_quality_gate");
    expect(unsafe.accepted).toBe(false);
    expect(unsafe.ttsInputText).toBe(display);
    expect(CONTEXT_TTS_REMEDIATION_ORDER).toEqual(["pronunciation_dictionary", "approved_context_rule", "meaning_preserving_ai_rewrite", "regenerate", "quality_gate"]);
  });
});
