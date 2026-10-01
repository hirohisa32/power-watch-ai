import { z } from "zod";
import { VOICE_PREVIEW_OPTIONS } from "./voice-preview";

function test(id: string, label: string, displayScript: string, ttsInputText: string, kind: "context_candidate" | "control") {
  return {
    id,
    label,
    displayScript,
    ttsInputText,
    kind,
    applied: kind === "context_candidate" ? [{
      targetTerm: "オマーン",
      displayPattern: displayScript,
      ttsTemplate: ttsInputText,
      source: "context_pronunciation_candidate",
      semanticPolicy: "same_meaning_only",
    }] : [],
  };
}

export const OMAN_CONTEXT_TESTS = [
  test("test-a", "TEST A · 時代／変革期", "1970年代、変革期のオマーン。", "1970年代、変革期を迎えていた、オマーンという国。", "context_candidate"),
  test("test-b", "TEST B · 同一文Control", "海を越えた外交と職人技、そして一人の功績が、この一本に残されています。", "海を越えた外交と職人技、そして一人の功績が、この一本に残されています。", "control"),
  test("test-c", "TEST C · 物語の結び", "時を超えて受け継がれる、オマーンの物語です。", "時を超えて受け継がれる、オマーンという国の物語です。", "context_candidate"),
] as const;

export const omanContextInputSchema = z.object({
  voiceId: z.enum([VOICE_PREVIEW_OPTIONS[0].voiceId, VOICE_PREVIEW_OPTIONS[1].voiceId]),
  testId: z.enum(OMAN_CONTEXT_TESTS.map((item) => item.id) as [string, ...string[]]),
});

export function omanContextTest(testId: string) {
  return OMAN_CONTEXT_TESTS.find((item) => item.id === testId);
}

export function omanContextObjectKey(voiceId: string, testId: string, variant: "raw" | "normalized") {
  const option = VOICE_PREVIEW_OPTIONS.find((candidate) => candidate.voiceId === voiceId);
  const item = omanContextTest(testId);
  if (!option || !item) throw new Error("OMAN_CONTEXT_PREVIEW_NOT_ALLOWED");
  return `system-assets/previews/oman-context/v1/${option.key}/${item.id}/${variant}.mp3`;
}
