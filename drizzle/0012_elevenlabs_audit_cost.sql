ALTER TABLE "elevenlabs_generation_audits"
  ADD COLUMN IF NOT EXISTS "character_cost" integer;
--> statement-breakpoint
ALTER TABLE "elevenlabs_generation_audits"
  ADD COLUMN IF NOT EXISTS "estimated_cost" real;
