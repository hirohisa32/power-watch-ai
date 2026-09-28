import { describe, expect, it, vi } from "vitest";
import { VoiceRouter } from "@/lib/audio/router";
import type { VoiceLibraryVoice } from "@/lib/audio/elevenlabs";

const narrator: VoiceLibraryVoice = {
  voiceId: "ja-male-documentary",
  name: "Deep Japanese Documentary",
  gender: "male",
  language: "ja",
  locale: "ja-JP",
  age: "middle-aged",
  category: "professional",
  accent: "japanese",
  useCases: ["narrative_story"],
  descriptives: ["documentary", "deep", "calm", "elegant"],
  verifiedLanguages: ["ja", "ja-JP"],
};

const dialogue: VoiceLibraryVoice = {
  voiceId: "ja-young-conversation",
  name: "Young Japanese Conversation",
  gender: "male",
  language: "ja",
  locale: "ja-JP",
  age: "young",
  category: "professional",
  accent: "japanese",
  useCases: ["conversational"],
  descriptives: ["energetic", "natural", "young"],
  verifiedLanguages: ["ja"],
};

const scenes = [
  {
    sceneId: "scene-1",
    preset: "HistoricalEvent",
    title: "歴史の転換点",
    narration: "時代は静かに動き始めた。",
    narrationTone: "documentary",
    dialogue: [{ speaker: "Racer", text: "行くぞ。", tone: "energetic" }],
    characterContext: "若いレーサー",
  },
  {
    sceneId: "scene-2",
    preset: "Racing",
    title: "決勝",
    narration: "時計は勝負の瞬間を刻む。",
    narrationTone: "solemn",
    dialogue: [{ speaker: "Racer", text: "まだ終わらない。", tone: "energetic" }],
    characterContext: "若いレーサー",
  },
];

function provider(voices: VoiceLibraryVoice[] = [narrator, dialogue]) {
  return { listLibraryVoices: vi.fn().mockResolvedValue({ voices, hasMore: false }) };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    language: "ja" as const,
    style: "cinematic_real" as const,
    scenes,
    presets: [],
    savedAssignments: [],
    defaultVoiceId: "default-voice",
    ...overrides,
  };
}

describe("Voice Router", () => {
  it("auto-selects a Japanese male documentary narrator with tone scoring", async () => {
    const mock = provider([
      { ...narrator, voiceId: "female", gender: "female" },
      { ...narrator, voiceId: "english-male", language: "en", locale: "en-US", verifiedLanguages: ["en"] },
      narrator,
    ]);
    const result = await new VoiceRouter(mock).select(input());
    expect(result.narratorVoiceId).toBe("ja-male-documentary");
    expect(result.narratorSelectionReason).toContain("gender=male");
    expect(result.narratorSelectionReason).toContain("tone=documentary");
    expect(result.assignments.find((item) => item.role === "narration")?.selectionMetadata)
      .toMatchObject({ language: "ja", source: "voice_library" });
    expect(mock.listLibraryVoices).toHaveBeenCalledTimes(1);
  });

  it("selects one young conversational voice and keeps it for the same speaker", async () => {
    const result = await new VoiceRouter(provider()).select(input());
    const racer = result.assignments.filter((item) => item.speakerKey === "racer");
    expect(racer).toHaveLength(2);
    expect(new Set(racer.map((item) => item.voiceId))).toEqual(
      new Set(["ja-young-conversation"]),
    );
  });

  it("reuses saved narrator and speaker voices without a library call", async () => {
    const mock = provider();
    const result = await new VoiceRouter(mock).select(
      input({
        projectNarratorVoiceId: "saved-narrator",
        projectNarratorSelectionReason: "saved narrator",
        savedAssignments: [
          {
            speakerKey: "racer",
            role: "dialogue",
            voiceId: "saved-racer",
            selectionSource: "saved",
          },
        ],
      }),
    );
    expect(result.narratorVoiceId).toBe("saved-narrator");
    expect(result.assignments.find((item) => item.speakerKey === "racer")?.voiceId).toBe(
      "saved-racer",
    );
    expect(mock.listLibraryVoices).not.toHaveBeenCalled();
  });

  it("prioritizes a Human manual override over automatic selection", async () => {
    const mock = provider();
    const result = await new VoiceRouter(mock).select(
      input({
        projectNarratorVoiceId: "old-narrator",
        savedAssignments: [
          {
            speakerKey: "narrator",
            role: "narration",
            voiceId: "human-narrator",
            selectionSource: "manual_override",
            manualOverride: true,
          },
          {
            speakerKey: "racer",
            role: "dialogue",
            voiceId: "human-racer",
            selectionSource: "manual_override",
            manualOverride: true,
          },
        ],
      }),
    );
    expect(result.narratorVoiceId).toBe("human-narrator");
    expect(result.assignments.every((item) => item.selectionSource === "manual_override")).toBe(
      true,
    );
    expect(mock.listLibraryVoices).not.toHaveBeenCalled();
  });

  it("works with no presets and falls back when candidates do not match Japanese", async () => {
    const englishOnly = { ...narrator, language: "en", locale: "en-US", verifiedLanguages: ["en"] };
    const result = await new VoiceRouter(provider([englishOnly])).select(
      input({ scenes: [{ ...scenes[0], dialogue: [] }] }),
    );
    expect(result.narratorVoiceId).toBe("default-voice");
    expect(result.narratorSelectionReason).toContain("Fallback");
    expect(result.assignments[0].selectionSource).toBe("default_fallback");
  });

  it("continues with the default voice when Voice Library fails", async () => {
    const mock = { listLibraryVoices: vi.fn().mockRejectedValue(new Error("library down")) };
    const result = await new VoiceRouter(mock).select(
      input({ scenes: [{ ...scenes[0], dialogue: [] }] }),
    );
    expect(result.narratorVoiceId).toBe("default-voice");
    expect(result.librarySearch.fallbackReason).toContain("library down");
    expect(result.assignments[0].selectionMetadata).toMatchObject({
      source: "default_fallback",
    });
  });
});
