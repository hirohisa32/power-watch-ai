import "server-only";
import { getDb } from "@/lib/db";
import { and, desc, eq } from "drizzle-orm";
import { narrationConfig } from "./config";
import { elevenLabsGenerationAudits } from "@/lib/db/schema";
import type { ElevenLabsRequestAudit } from "./elevenlabs";

export async function saveElevenLabsGenerationAudit(input: {
  audit: ElevenLabsRequestAudit;
  purpose: "voice_preview" | "final_narration";
  projectId?: string;
  storyboardId?: string;
  audioRecordId?: string;
  requestId?: string;
  characterCost?: number;
  status?: "completed" | "failed";
  errorMessage?: string;
}) {
  await getDb()
    .insert(elevenLabsGenerationAudits)
    .values({
      projectId: input.projectId,
      storyboardId: input.storyboardId,
      audioRecordId: input.audioRecordId,
      purpose: input.purpose,
      originalScript: input.audit.originalScript,
      ttsInputText: input.audit.ttsInputText,
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
      estimatedCost:
        input.characterCost === undefined
          ? undefined
          : (input.characterCost / 1000) * narrationConfig().pricePerThousandCharacters,
      status: input.status ?? "completed",
      errorMessage: input.errorMessage,
      generatedAt: input.audit.generatedAt,
    });
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
      estimatedCost:
        (characterCost / 1000) * narrationConfig().pricePerThousandCharacters,
    })
    .where(eq(elevenLabsGenerationAudits.id, id));
}
