CREATE TABLE "elevenlabs_generation_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid REFERENCES "projects"("id") ON DELETE cascade,
  "storyboard_id" uuid REFERENCES "storyboards"("id") ON DELETE cascade,
  "audio_record_id" uuid REFERENCES "audio_records"("id") ON DELETE set null,
  "purpose" text NOT NULL,
  "original_script" text NOT NULL,
  "tts_input_text" text NOT NULL,
  "voice_id" text NOT NULL,
  "model" text NOT NULL,
  "voice_settings" jsonb NOT NULL,
  "language" text NOT NULL,
  "output_format" text NOT NULL,
  "seed" integer,
  "apply_text_normalization" text NOT NULL,
  "apply_language_text_normalization" boolean DEFAULT false NOT NULL,
  "request_id" text,
  "status" text DEFAULT 'completed' NOT NULL,
  "error_message" text,
  "generated_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "elevenlabs_generation_audits_status_check" CHECK ("status" IN ('completed', 'failed'))
);
CREATE INDEX "elevenlabs_generation_audits_project_idx"
  ON "elevenlabs_generation_audits"("project_id", "generated_at");
CREATE INDEX "elevenlabs_generation_audits_generated_idx"
  ON "elevenlabs_generation_audits"("generated_at");
