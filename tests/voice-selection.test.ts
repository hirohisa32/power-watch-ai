import { describe, expect, it } from "vitest";
import { buildSpeechSegments, selectVoicePlan, type ApprovedVoicePreset } from "@/lib/audio/voices";

const presets: ApprovedVoicePreset[] = [
  {
    id: "p-documentary",
    key: "documentary-male",
    voiceId: "voice-documentary",
    name: "Documentary Male",
    gender: "male",
    roles: ["narration", "dialogue"],
    tones: ["documentary", "solemn"],
    languages: ["ja"],
    priority: 10,
    approved: true,
  },
  {
    id: "p-energetic",
    key: "energetic-male",
    voiceId: "voice-energetic",
    name: "Energetic Male",
    gender: "male",
    roles: ["dialogue"],
    tones: ["energetic"],
    languages: ["ja"],
    priority: 5,
    approved: true,
  },
  {
    id: "p-unapproved",
    key: "unapproved",
    voiceId: "voice-unapproved",
    name: "Unapproved",
    gender: "female",
    roles: ["narration"],
    tones: ["documentary"],
    languages: ["ja"],
    priority: 100,
    approved: false,
  },
];

const scenes = [
  {
    sceneId: "scene-1",
    preset: "Opening",
    title: "Opening",
    narration: "時代は動き始めた。",
    narrationTone: "documentary",
    dialogue: [{ speaker: "Driver", text: "行くぞ。", tone: "energetic" }],
  },
  {
    sceneId: "scene-2",
    preset: "Racing",
    title: "Race",
    narration: "時計はその瞬間を刻む。",
    narrationTone: "solemn",
    dialogue: [{ speaker: "Driver", text: "まだ終わらない。", tone: "solemn" }],
  },
];

describe("multi voice direction", () => {
  it("keeps one narrator voice and one stable voice per dialogue speaker", () => {
    const plan = selectVoicePlan({ language: "ja", scenes, presets });
    expect(plan.narratorVoiceId).toBe("voice-documentary");
    expect(
      new Set(
        plan.assignments
          .filter((assignment) => assignment.role === "narration")
          .map((assignment) => assignment.voiceId),
      ),
    ).toEqual(new Set(["voice-documentary"]));
    expect(
      new Set(
        plan.assignments
          .filter((assignment) => assignment.speakerKey === "driver")
          .map((assignment) => assignment.voiceId),
      ),
    ).toEqual(new Set(["voice-energetic"]));
  });

  it("preserves a project narrator and uses the default only as fallback", () => {
    expect(
      selectVoicePlan({
        language: "ja",
        scenes,
        presets,
        projectNarratorVoiceId: "voice-documentary",
        defaultVoiceId: "fallback",
      }).narratorVoiceId,
    ).toBe("voice-documentary");
    expect(
      selectVoicePlan({ language: "en", scenes, presets: [], defaultVoiceId: "fallback" })
        .narratorVoiceId,
    ).toBe("fallback");
  });

  it("builds voice-specific speech segments when dialogue exists", () => {
    const plan = selectVoicePlan({ language: "ja", scenes, presets });
    const segments = buildSpeechSegments({
      scenes,
      assignments: plan.assignments,
      narrationScript: "unused",
      narratorVoiceId: plan.narratorVoiceId,
    });
    expect(segments.map((segment) => [segment.role, segment.voiceId])).toEqual([
      ["narration", "voice-documentary"],
      ["dialogue", "voice-energetic"],
      ["narration", "voice-documentary"],
      ["dialogue", "voice-energetic"],
    ]);
  });

  it("keeps narration aligned as one speech segment per scene", () => {
    const narrationOnly = scenes.map((scene) => ({ ...scene, dialogue: [] }));
    const plan = selectVoicePlan({ language: "ja", scenes: narrationOnly, presets });
    const segments = buildSpeechSegments({
      scenes: narrationOnly,
      assignments: plan.assignments,
      narrationScript: "連結済み原稿はScene音声生成には使わない",
      narratorVoiceId: plan.narratorVoiceId,
    });
    expect(segments).toHaveLength(narrationOnly.length);
    expect(segments.map((segment) => segment.sceneId)).toEqual(
      narrationOnly.map((scene) => scene.sceneId),
    );
    expect(new Set(segments.map((segment) => segment.voiceId))).toEqual(
      new Set([plan.narratorVoiceId]),
    );
  });
});
