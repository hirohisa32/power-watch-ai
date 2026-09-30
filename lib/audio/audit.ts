import "server-only";
import { getDb } from "@/lib/db";
import { elevenLabsGenerationAudits } from "@/lib/db/schema";
import type { ElevenLabsRequestAudit } from "./elevenlabs";

export async function saveElevenLabsGenerationAudit(input: {
  audit: ElevenLabsRequestAudit;
  purpose: "voice_preview" | "final_narration";
  projectId?: string;
  storyboardId?: string;
  audioRecordId?: string;
  requestId?: string;
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
      status: input.status ?? "completed",
      errorMessage: input.errorMessage,
      generatedAt: input.audit.generatedAt,
    });
}
