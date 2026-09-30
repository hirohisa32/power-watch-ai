ALTER TABLE "elevenlabs_generation_audits"
  ADD COLUMN IF NOT EXISTS "display_script" text;
--> statement-breakpoint
UPDATE "elevenlabs_generation_audits"
  SET "display_script" = "original_script"
  WHERE "display_script" IS NULL;
--> statement-breakpoint
ALTER TABLE "elevenlabs_generation_audits"
  ALTER COLUMN "display_script" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "elevenlabs_generation_audits"
  ADD COLUMN IF NOT EXISTS "reading_map" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "elevenlabs_generation_audits"
  ADD COLUMN IF NOT EXISTS "duration_seconds" real;
