export type VoiceRole = "narration" | "dialogue";

export type ApprovedVoicePreset = {
  id?: string;
  key: string;
  voiceId: string;
  name: string;
  gender: "male" | "female" | "neutral";
  roles: VoiceRole[];
  tones: string[];
  languages: Array<"ja" | "en" | "zh">;
  priority: number;
  approved: boolean;
};

export type DialogueLine = {
  speaker: string;
  text: string;
  tone?: string;
};

export type VoiceScene = {
  sceneId: string;
  preset: string;
  title: string;
  narration: string;
  narrationTone?: string;
  dialogue?: DialogueLine[];
  characterContext?: string;
};

export type VoiceAssignment = {
  sceneId: string;
  speakerKey: string;
  role: VoiceRole;
  voicePresetId?: string;
  voiceId: string;
  tone: string;
  selectionSource?: VoiceSelectionSource;
  selectionReason?: string;
  selectionMetadata?: Record<string, unknown>;
  manualOverride?: boolean;
};

export type VoiceSelectionSource =
  "manual_override" | "saved" | "approved_preset" | "voice_library" | "default_fallback";

export type VoicePlan = {
  narratorVoiceId: string;
  assignments: VoiceAssignment[];
};

export type SpeechSegment = {
  sceneId: string | null;
  speakerKey: string;
  role: VoiceRole;
  voiceId: string;
  text: string;
  tone: string;
};

export function buildSpeechSegments(input: {
  scenes: VoiceScene[];
  assignments: VoiceAssignment[];
  narrationScript: string;
  narratorVoiceId: string;
}): SpeechSegment[] {
  const hasDialogue = input.scenes.some((scene) =>
    (scene.dialogue ?? []).some((line) => line.text.trim()),
  );
  if (!hasDialogue && input.narrationScript.trim()) {
    return [
      {
        sceneId: null,
        speakerKey: "narrator",
        role: "narration",
        voiceId: input.narratorVoiceId,
        text: input.narrationScript.trim(),
        tone: dominantTone(input.scenes.map((scene) => scene.narrationTone)) ?? "documentary",
      },
    ];
  }
  const segments: SpeechSegment[] = [];
  for (const scene of input.scenes) {
    const narrator = findAssignment(input.assignments, scene.sceneId, "narrator", "narration");
    if (scene.narration.trim())
      segments.push({
        sceneId: scene.sceneId,
        speakerKey: "narrator",
        role: "narration",
        voiceId: narrator?.voiceId ?? input.narratorVoiceId,
        text: scene.narration.trim(),
        tone: narrator?.tone ?? scene.narrationTone ?? "documentary",
      });
    for (const line of scene.dialogue ?? []) {
      const speakerKey = normalizeSpeaker(line.speaker);
      const assignment = findAssignment(input.assignments, scene.sceneId, speakerKey, "dialogue");
      segments.push({
        sceneId: scene.sceneId,
        speakerKey,
        role: "dialogue",
        voiceId: assignment?.voiceId ?? input.narratorVoiceId,
        text: line.text.trim(),
        tone: assignment?.tone ?? line.tone ?? "neutral",
      });
    }
  }
  return segments.filter((segment) => segment.text.length > 0);
}

/**
 * Selects approved voices with semantic scoring. The decision is deterministic so retries keep
 * the same cast; the persisted result, not a later re-evaluation, is used by the render worker.
 */
export function selectVoicePlan(input: {
  language: "ja" | "en" | "zh";
  scenes: VoiceScene[];
  presets: ApprovedVoicePreset[];
  defaultVoiceId?: string;
  projectNarratorVoiceId?: string | null;
}): VoicePlan {
  const approved = input.presets.filter(
    (preset) => preset.approved && preset.languages.includes(input.language),
  );
  const narrationTone = dominantTone(
    input.scenes.map((scene) =>
      inferTone(scene.narrationTone, `${scene.preset} ${scene.title} ${scene.narration}`),
    ),
  );
  const narrator =
    findVoice(input.projectNarratorVoiceId, approved) ??
    fallbackPreset(input.projectNarratorVoiceId ?? undefined) ??
    selectPreset(approved, "narration", narrationTone, true) ??
    fallbackPreset(input.defaultVoiceId);
  if (!narrator) throw new Error("VOICE_PRESET_REQUIRED");

  const speakerVoices = new Map<string, ApprovedVoicePreset>();
  const assignments: VoiceAssignment[] = [];
  for (const scene of input.scenes) {
    const sceneTone = inferTone(
      scene.narrationTone,
      `${scene.preset} ${scene.title} ${scene.narration}`,
    );
    assignments.push(toAssignment(scene.sceneId, "narrator", "narration", narrator, sceneTone));
    for (const line of scene.dialogue ?? []) {
      const speakerKey = normalizeSpeaker(line.speaker);
      const dialogueTone = inferTone(
        line.tone,
        `${scene.preset} ${scene.title} ${line.speaker} ${line.text}`,
      );
      let preset = speakerVoices.get(speakerKey);
      if (!preset) {
        preset =
          selectPreset(
            approved.filter((candidate) => candidate.voiceId !== narrator.voiceId),
            "dialogue",
            dialogueTone,
            true,
          ) ??
          selectPreset(approved, "dialogue", dialogueTone, true) ??
          narrator;
        speakerVoices.set(speakerKey, preset);
      }
      assignments.push(toAssignment(scene.sceneId, speakerKey, "dialogue", preset, dialogueTone));
    }
  }
  return { narratorVoiceId: narrator.voiceId, assignments };
}

function selectPreset(
  presets: ApprovedVoicePreset[],
  role: VoiceRole,
  tone: string | undefined,
  preferMale: boolean,
) {
  const normalizedTone = normalizeTone(tone);
  return presets
    .filter((preset) => preset.roles.includes(role))
    .map((preset) => ({
      preset,
      score:
        preset.priority +
        (preferMale && preset.gender === "male" ? 100 : 0) +
        (normalizedTone && preset.tones.some((item) => normalizeTone(item) === normalizedTone)
          ? 50
          : 0),
    }))
    .sort((a, b) => b.score - a.score || a.preset.key.localeCompare(b.preset.key))[0]?.preset;
}

function findVoice(voiceId: string | null | undefined, presets: ApprovedVoicePreset[]) {
  return voiceId ? presets.find((preset) => preset.voiceId === voiceId) : undefined;
}

function findAssignment(
  assignments: VoiceAssignment[],
  sceneId: string,
  speakerKey: string,
  role: VoiceRole,
) {
  return assignments.find(
    (assignment) =>
      assignment.sceneId === sceneId &&
      assignment.speakerKey === speakerKey &&
      assignment.role === role,
  );
}

function fallbackPreset(voiceId: string | undefined): ApprovedVoicePreset | undefined {
  return voiceId
    ? {
        key: "default-fallback",
        voiceId,
        name: "Default Fallback",
        gender: "male",
        roles: ["narration", "dialogue"],
        tones: [],
        languages: ["ja", "en", "zh"],
        priority: -1,
        approved: true,
      }
    : undefined;
}

function toAssignment(
  sceneId: string,
  speakerKey: string,
  role: VoiceRole,
  preset: ApprovedVoicePreset,
  tone?: string,
): VoiceAssignment {
  return {
    sceneId,
    speakerKey,
    role,
    voicePresetId: preset.id,
    voiceId: preset.voiceId,
    tone: normalizeTone(tone) || "neutral",
  };
}

function normalizeSpeaker(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, "-") || "speaker";
}

function normalizeTone(value?: string) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function inferTone(explicit: string | undefined, context: string) {
  if (normalizeTone(explicit)) return normalizeTone(explicit);
  const value = context.toLocaleLowerCase();
  if (/racing|race|engine|fire|追跡|レース|炎|疾走/.test(value)) return "energetic";
  if (/danger|war|crisis|緊張|危機|戦争/.test(value)) return "tense";
  if (/ending|hero|legacy|継承|未来|希望/.test(value)) return "warm";
  if (/oldbook|vintage|historical|history|歴史|時代|記録/.test(value)) return "documentary";
  return "neutral";
}

function dominantTone(values: Array<string | undefined>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const tone = normalizeTone(value);
    if (tone) counts.set(tone, (counts.get(tone) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}
