import "server-only";
import { getDb } from "@/lib/db";
import { and, desc, eq } from "drizzle-orm";
import { narrationConfig } from "./config";
import { elevenLabsGenerationAudits } from "@/lib/db/schema";
import type { ElevenLabsRequestAudit } from "./elevenlabs";

export async function saveElevenLabsGenerationAudit(input: {
  audit: ElevenLabsRequestAudit;
  purpose: "voice_preview" | "final_narration" | "narration";
  projectId?: string;
  storyboardId?: string;
  audioRecordId?: string;
  videoId?: string;
  requestId?: string;
  characterCost?: number;
  readingMap?: Array<Record<string, unknown>>;
  durationSeconds?: number;
  status?: "completed" | "failed";
  errorMessage?: string;
}) {
  const [record] = await getDb()
    .insert(elevenLabsGenerationAudits)
    .values({
      projectId: input.projectId,
      storyboardId: input.storyboardId,
      audioRecordId: input.audioRecordId,
      videoId: input.videoId,
      purpose: input.purpose,
      originalScript: input.audit.originalScript,
      displayScript: input.audit.originalScript,
      ttsInputText: input.audit.ttsInputText,
      readingMap: input.readingMap ?? [],
      voiceId: input.audit.voiceId,
      model: input.audit.model,
      voiceSettings: input.audit.voiceSettings,
      language: input.audit.language,
      outputFormat: input.audit.outputFormat,
      seed: input.audit.seed,
      applyTextNormalization: input.audit.applyTextNormalization,
      applyLanguageTextNormalization: input.audit.applyLanguageTextNormalization,
      requestId: input.requestId,
      characterCost: input.characterCost,
      units: input.characterCost,
      estimatedCost:
        input.characterCost === undefined
          ? undefined
          : (input.characterCost / 1000) * narrationConfig().pricePerThousandCharacters,
      durationSeconds: input.durationSeconds,
      status: input.status ?? "completed",
      errorMessage: input.errorMessage,
      generatedAt: input.audit.generatedAt,
    })
    .returning({ id: elevenLabsGenerationAudits.id });
  return record;
}

export async function findLatestVoicePreviewAudit(voiceId: string, ttsInputText: string) {
  const [record] = await getDb()
    .select()
    .from(elevenLabsGenerationAudits)
    .where(
      and(
        eq(elevenLabsGenerationAudits.purpose, "voice_preview"),
        eq(elevenLabsGenerationAudits.voiceId, voiceId),
        eq(elevenLabsGenerationAudits.ttsInputText, ttsInputText),
      ),
    )
    .orderBy(desc(elevenLabsGenerationAudits.generatedAt))
    .limit(1);
  return record;
}

export async function updateElevenLabsAuditCost(id: string, characterCost: number) {
  await getDb()
    .update(elevenLabsGenerationAudits)
    .set({
      characterCost,
      units: characterCost,
      estimatedCost:
        (characterCost / 1000) * narrationConfig().pricePerThousandCharacters,
    })
    .where(eq(elevenLabsGenerationAudits.id, id));
}

export async function updateElevenLabsAuditDuration(id: string, durationSeconds: number) {
  await getDb()
    .update(elevenLabsGenerationAudits)
    .set({ durationSeconds })
    .where(eq(elevenLabsGenerationAudits.id, id));
}
