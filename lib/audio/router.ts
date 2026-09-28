import type {
  VoiceLibraryQuery,
  VoiceLibraryResult,
  VoiceLibraryVoice,
} from "./elevenlabs";
import type {
  ApprovedVoicePreset,
  VoiceAssignment,
  VoiceRole,
  VoiceScene,
  VoiceSelectionSource,
} from "./voices";

const MINIMUM_SCORE = 0.55;

export type VoiceRouterProvider = {
  listLibraryVoices(input?: VoiceLibraryQuery): Promise<VoiceLibraryResult>;
};

export type SavedVoiceAssignment = {
  speakerKey: string;
  role: VoiceRole;
  voiceId: string;
  selectionSource?: string | null;
  selectionReason?: string | null;
  selectionMetadata?: Record<string, unknown> | null;
  manualOverride?: boolean;
};

export type VoiceRouterInput = {
  language: "ja" | "en" | "zh";
  style: "cinematic_real" | "animation";
  scenes: VoiceScene[];
  presets: ApprovedVoicePreset[];
  savedAssignments: SavedVoiceAssignment[];
  projectNarratorVoiceId?: string | null;
  projectNarratorSelectionReason?: string | null;
  defaultVoiceId?: string;
};

export type VoiceRouterResult = {
  narratorVoiceId: string;
  narratorSelectionReason: string;
  assignments: VoiceAssignment[];
  librarySearch: {
    performed: boolean;
    candidateCount: number;
    fallbackReason?: string;
  };
};

type VoiceTarget = {
  speakerKey: string;
  role: VoiceRole;
  tone: string;
  age: "young" | "middle-aged";
  context: string;
  sceneIds: string[];
};

type Candidate = {
  voiceId: string;
  source: "approved_preset" | "voice_library";
  name: string;
  gender?: string;
  languages: string[];
  age?: string;
  category?: string;
  roles: VoiceRole[];
  tones: string[];
  useCases: string[];
  descriptives: string[];
  description?: string;
  accent?: string;
  priority: number;
  presetId?: string;
};

type Selection = {
  voiceId: string;
  presetId?: string;
  source: VoiceSelectionSource;
  reason: string;
  metadata: Record<string, unknown>;
  manualOverride?: boolean;
};

export class VoiceRouter {
  constructor(private readonly provider: VoiceRouterProvider) {}

  async select(input: VoiceRouterInput): Promise<VoiceRouterResult> {
    if (!input.defaultVoiceId) throw new Error("ELEVENLABS_DEFAULT_VOICE_ID_REQUIRED");
    const targets = buildTargets(input.scenes);
    const saved = savedMap(input.savedAssignments);
    const storedNarrator = saved.get(targetKey("narrator", "narration"));
    const narratorSaved = storedNarrator?.manualOverride
      ? storedNarrator
      : input.projectNarratorVoiceId
        ? savedSelection({
          speakerKey: "narrator",
          role: "narration",
          voiceId: input.projectNarratorVoiceId,
          selectionSource: "saved",
          selectionReason:
            input.projectNarratorSelectionReason || "Projectに保存済みのNarrator Voiceを再利用",
          })
        : storedNarrator;
    const unresolved = targets.filter(
      (target) =>
        !(target.role === "narration" && narratorSaved) &&
        !saved.has(targetKey(target.speakerKey, target.role)),
    );

    let library: VoiceLibraryVoice[] = [];
    let fallbackReason: string | undefined;
    if (unresolved.length) {
      try {
        const response = await this.provider.listLibraryVoices({
          language: input.language,
          gender: "male",
          page: 0,
          pageSize: 50,
        });
        library = response.voices;
        if (!library.length) fallbackReason = "Voice Libraryに候補がありません";
      } catch (error) {
        fallbackReason = `Voice Library取得失敗: ${error instanceof Error ? error.message : "unknown"}`;
      }
    }

    const candidates = [
      ...input.presets.filter((preset) => preset.approved).map(presetCandidate),
      ...library.map(libraryCandidate),
    ];
    const selections = new Map<string, Selection>();
    if (narratorSaved) selections.set(targetKey("narrator", "narration"), narratorSaved);
    for (const [key, selection] of saved) selections.set(key, selection);

    for (const target of unresolved) {
      const key = targetKey(target.speakerKey, target.role);
      if (selections.has(key)) continue;
      const selection = selectCandidate(target, candidates, input.language, input.style);
      selections.set(
        key,
        selection ?? fallbackSelection(input.defaultVoiceId, fallbackReason || "score threshold未満"),
      );
    }

    const narrator =
      selections.get(targetKey("narrator", "narration")) ??
      fallbackSelection(input.defaultVoiceId, fallbackReason || "Narrator候補なし");
    const assignments: VoiceAssignment[] = [];
    for (const target of targets) {
      const selection =
        selections.get(targetKey(target.speakerKey, target.role)) ??
        fallbackSelection(input.defaultVoiceId, "Speaker候補なし");
      for (const sceneId of target.sceneIds) {
        assignments.push({
          sceneId,
          speakerKey: target.speakerKey,
          role: target.role,
          voicePresetId: selection.presetId,
          voiceId: selection.voiceId,
          tone: target.tone,
          selectionSource: selection.source,
          selectionReason: selection.reason,
          selectionMetadata: selection.metadata,
          manualOverride: selection.manualOverride,
        });
      }
    }
    return {
      narratorVoiceId: narrator.voiceId,
      narratorSelectionReason: narrator.reason,
      assignments,
      librarySearch: {
        performed: unresolved.length > 0,
        candidateCount: library.length,
        fallbackReason,
      },
    };
  }
}

function buildTargets(scenes: VoiceScene[]): VoiceTarget[] {
  const narratorTone = dominantTone(
    scenes.map((scene) => inferTone(scene.narrationTone, sceneContext(scene))),
  );
  const targets: VoiceTarget[] = [
    {
      speakerKey: "narrator",
      role: "narration",
      tone: narratorTone,
      age: "middle-aged",
      context: scenes.map(sceneContext).join(" "),
      sceneIds: scenes.map((scene) => scene.sceneId),
    },
  ];
  const speakers = new Map<string, { tones: string[]; contexts: string[]; sceneIds: Set<string> }>();
  for (const scene of scenes) {
    for (const line of scene.dialogue ?? []) {
      const speakerKey = normalizeSpeaker(line.speaker);
      const entry = speakers.get(speakerKey) ?? {
        tones: [],
        contexts: [],
        sceneIds: new Set<string>(),
      };
      entry.tones.push(inferTone(line.tone, `${sceneContext(scene)} ${line.speaker} ${line.text}`));
      entry.contexts.push(`${line.speaker} ${line.text} ${sceneContext(scene)}`);
      entry.sceneIds.add(scene.sceneId);
      speakers.set(speakerKey, entry);
    }
  }
  for (const [speakerKey, entry] of speakers) {
    const context = entry.contexts.join(" ");
    targets.push({
      speakerKey,
      role: "dialogue",
      tone: dominantTone(entry.tones),
      age: /young|youth|teen|若|青年|少年|レーサー/i.test(context) ? "young" : "middle-aged",
      context,
      sceneIds: [...entry.sceneIds],
    });
  }
  return targets;
}

function selectCandidate(
  target: VoiceTarget,
  candidates: Candidate[],
  language: string,
  style: string,
): Selection | undefined {
  const ranked = candidates
    .map((candidate) => ({ candidate, ...scoreCandidate(candidate, target, language, style) }))
    .filter((item) => item.languageMatch && item.score >= MINIMUM_SCORE)
    .sort((a, b) => b.score - a.score || a.candidate.voiceId.localeCompare(b.candidate.voiceId));
  const best = ranked[0];
  if (!best) return undefined;
  const score = Number(best.score.toFixed(3));
  const metadata = {
    score,
    scoreThreshold: MINIMUM_SCORE,
    scoreComponents: best.components,
    role: target.role,
    tone: target.tone,
    requestedAge: target.age,
    language,
    gender: best.candidate.gender,
    age: best.candidate.age,
    category: best.candidate.category,
    useCases: best.candidate.useCases,
    descriptives: best.candidate.descriptives,
    source: best.candidate.source,
    candidateName: best.candidate.name,
  };
  return {
    voiceId: best.candidate.voiceId,
    presetId: best.candidate.presetId,
    source: best.candidate.source,
    reason: `role=${target.role}; gender=${best.candidate.gender || "unknown"}; age=${best.candidate.age || "unknown"}; tone=${target.tone}; language=${language}; source=${best.candidate.source}; score=${score}`,
    metadata,
  };
}

function scoreCandidate(candidate: Candidate, target: VoiceTarget, language: string, style: string) {
  const normalizedLanguages = candidate.languages.map(normalize);
  const languageMatch = normalizedLanguages.some(
    (value) => value === normalize(language) || value.startsWith(`${normalize(language)}-`),
  );
  const gender = normalize(candidate.gender) === "male" ? 1 : 0;
  const role = candidate.roles.includes(target.role) || roleTerms(candidate, target.role) ? 1 : 0;
  const tone = termMatch(candidateTerms(candidate), toneTerms(target.tone)) ? 1 : 0;
  const age = normalize(candidate.age) === normalize(target.age) ? 1 : 0;
  const specialty = termMatch(
    candidateTerms(candidate),
    target.role === "narration"
      ? ["documentary", "narrative", "story", "audiobook", "calm", "deep", "elegant", "luxury", "refined", "cinematic"]
      : ["conversational", "conversation", "character", "natural", "energetic"],
  )
    ? 1
    : 0;
  const context = termMatch(candidateTerms(candidate), tokenize(`${target.context} ${style}`)) ? 1 : 0;
  const presetBonus = candidate.source === "approved_preset" ? Math.min(1, Math.max(0, candidate.priority / 100)) : 0;
  const components = {
    language: languageMatch ? 0.25 : 0,
    gender: gender * 0.15,
    role: role * 0.15,
    tone: tone * 0.15,
    age: age * 0.1,
    specialty: specialty * 0.15,
    context: context * 0.03,
    approvedPreset: presetBonus * 0.02,
  };
  return {
    languageMatch,
    components,
    score: Object.values(components).reduce((sum, value) => sum + value, 0),
  };
}

function presetCandidate(preset: ApprovedVoicePreset): Candidate {
  return {
    voiceId: preset.voiceId,
    source: "approved_preset",
    name: preset.name,
    gender: preset.gender,
    languages: preset.languages,
    roles: preset.roles,
    tones: preset.tones,
    useCases: preset.roles === undefined ? [] : preset.roles,
    descriptives: preset.tones,
    priority: preset.priority,
    presetId: preset.id,
  };
}

function libraryCandidate(voice: VoiceLibraryVoice): Candidate {
  const languages = [voice.language, voice.locale, ...voice.verifiedLanguages].filter(
    (value): value is string => Boolean(value),
  );
  return {
    voiceId: voice.voiceId,
    source: "voice_library",
    name: voice.name,
    gender: voice.gender,
    languages,
    age: voice.age,
    category: voice.category,
    roles: [],
    tones: voice.descriptives,
    useCases: voice.useCases,
    descriptives: voice.descriptives,
    description: voice.description,
    accent: voice.accent,
    priority: 0,
  };
}

function savedMap(assignments: SavedVoiceAssignment[]) {
  const map = new Map<string, Selection>();
  for (const assignment of assignments) {
    const key = targetKey(assignment.speakerKey, assignment.role);
    const current = map.get(key);
    if (current?.manualOverride && !assignment.manualOverride) continue;
    map.set(key, savedSelection(assignment));
  }
  return map;
}

function savedSelection(assignment: SavedVoiceAssignment): Selection {
  const manual = Boolean(assignment.manualOverride || assignment.selectionSource === "manual_override");
  return {
    voiceId: assignment.voiceId,
    source: manual ? "manual_override" : "saved",
    reason:
      assignment.selectionReason ||
      (manual ? "Human指定Voiceを優先" : "DBに保存済みのVoiceを再利用"),
    metadata: assignment.selectionMetadata ?? { reused: true },
    manualOverride: manual,
  };
}

function fallbackSelection(voiceId: string, reason: string): Selection {
  return {
    voiceId,
    source: "default_fallback",
    reason: `ELEVENLABS_DEFAULT_VOICE_IDへFallback: ${reason}`,
    metadata: { score: 0, source: "default_fallback", fallbackReason: reason },
  };
}

function roleTerms(candidate: Candidate, role: VoiceRole) {
  const terms = candidateTerms(candidate);
  return termMatch(
    terms,
    role === "narration"
      ? ["narration", "narrative", "documentary", "audiobook", "story"]
      : ["dialogue", "conversational", "conversation", "character"],
  );
}

function candidateTerms(candidate: Candidate) {
  return tokenize(
    [
      candidate.name,
      candidate.description,
      candidate.accent,
      candidate.category,
      ...candidate.tones,
      ...candidate.useCases,
      ...candidate.descriptives,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function toneTerms(tone: string) {
  const map: Record<string, string[]> = {
    documentary: ["documentary", "narrative", "deep", "calm", "solemn"],
    solemn: ["solemn", "deep", "serious", "documentary"],
    elegant: ["elegant", "luxury", "refined", "calm"],
    warm: ["warm", "calm", "elegant", "friendly"],
    energetic: ["energetic", "young", "conversational", "dynamic"],
    tense: ["tense", "dramatic", "serious", "deep"],
    neutral: ["natural", "conversational", "calm", "neutral"],
  };
  return map[normalize(tone)] ?? [normalize(tone)];
}

function sceneContext(scene: VoiceScene) {
  return `${scene.preset} ${scene.title} ${scene.narration} ${scene.characterContext ?? ""}`;
}

function inferTone(explicit: string | undefined, context: string) {
  if (normalize(explicit)) return normalize(explicit);
  const value = normalize(context);
  if (/racing|race|engine|fire|追跡|レース|炎|疾走/.test(value)) return "energetic";
  if (/danger|war|crisis|緊張|危機|戦争/.test(value)) return "tense";
  if (/ending|hero|legacy|継承|未来|希望|luxury|高級/.test(value)) return "elegant";
  if (/oldbook|vintage|historical|history|歴史|時代|記録/.test(value)) return "documentary";
  return "neutral";
}

function dominantTone(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "neutral";
}

function tokenize(value: string) {
  return normalize(value)
    .split(/[^\p{L}\p{N}-]+/u)
    .filter(Boolean);
}

function termMatch(candidateTerms: string[], desired: string[]) {
  const terms = new Set(candidateTerms.map(normalize));
  return desired.some((value) => terms.has(normalize(value)));
}

function targetKey(speakerKey: string, role: VoiceRole) {
  return `${role}:${normalizeSpeaker(speakerKey)}`;
}

function normalizeSpeaker(value: string) {
  return normalize(value).replace(/\s+/g, "-") || "speaker";
}

function normalize(value?: string) {
  return value?.trim().toLocaleLowerCase() ?? "";
}
