ALTER TABLE "elevenlabs_generation_audits" ADD COLUMN IF NOT EXISTS "video_id" uuid;
--> statement-breakpoint
ALTER TABLE "elevenlabs_generation_audits" ADD COLUMN IF NOT EXISTS "units" integer;
--> statement-breakpoint
UPDATE "elevenlabs_generation_audits" SET "units" = "character_cost" WHERE "units" IS NULL AND "character_cost" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "elevenlabs_generation_audits_video_idx" ON "elevenlabs_generation_audits" ("video_id", "generated_at");
--> statement-breakpoint
INSERT INTO "voice_presets" (
  "key", "voice_id", "name", "gender", "roles", "tones", "languages", "source", "approved", "priority"
) VALUES
  ('elevenlabs-v4-voice-a', 'Bj4Malc5SZLoXfPtxRxH', 'Voice A（v4承認済み）', 'male', '["narration","dialogue"]'::jsonb, '["calm","documentary","luxury"]'::jsonb, '["ja"]'::jsonb, 'human-approved-v4', true, 100),
  ('elevenlabs-v4-voice-b', 'hV5AJXCCNGT56GPYPLiG', 'Voice B（v4承認済み）', 'male', '["narration","dialogue"]'::jsonb, '["calm","documentary","luxury"]'::jsonb, '["ja"]'::jsonb, 'human-approved-v4', true, 99)
ON CONFLICT ("voice_id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "gender" = EXCLUDED."gender",
  "roles" = EXCLUDED."roles",
  "tones" = EXCLUDED."tones",
  "languages" = EXCLUDED."languages",
  "source" = EXCLUDED."source",
  "approved" = EXCLUDED."approved",
  "priority" = EXCLUDED."priority",
  "updated_at" = now();
