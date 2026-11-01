ALTER TABLE "video_generations" ADD COLUMN IF NOT EXISTS "story_beat_id" text;
ALTER TABLE "video_generations" ADD COLUMN IF NOT EXISTS "historical_period" text;
ALTER TABLE "video_generations" ADD COLUMN IF NOT EXISTS "location" text;
ALTER TABLE "video_generations" ADD COLUMN IF NOT EXISTS "character_id" text;
ALTER TABLE "video_generations" ADD COLUMN IF NOT EXISTS "visual_intent" text;

ALTER TABLE "image_generation_audits" ADD COLUMN IF NOT EXISTS "story_beat_id" text;
ALTER TABLE "image_generation_audits" ADD COLUMN IF NOT EXISTS "historical_period" text;
ALTER TABLE "image_generation_audits" ADD COLUMN IF NOT EXISTS "location" text;
ALTER TABLE "image_generation_audits" ADD COLUMN IF NOT EXISTS "character_id" text;
ALTER TABLE "image_generation_audits" ADD COLUMN IF NOT EXISTS "visual_intent" text;

UPDATE "video_generations" AS generation
SET
  "story_beat_id" = scene."narration_segment_id",
  "historical_period" = scene."historical_period",
  "location" = scene."location",
  "character_id" = scene."character_id",
  "visual_intent" = scene."visual_intent"
FROM "scenes" AS scene
WHERE generation."scene_id" = scene."id";

UPDATE "image_generation_audits" AS audit
SET
  "story_beat_id" = scene."narration_segment_id",
  "historical_period" = scene."historical_period",
  "location" = scene."location",
  "character_id" = scene."character_id",
  "visual_intent" = scene."visual_intent"
FROM "scenes" AS scene
WHERE audit."scene_id" = scene."id";

CREATE INDEX IF NOT EXISTS "video_generations_scope_idx"
  ON "video_generations" ("project_id", "scene_id", "story_beat_id");
CREATE INDEX IF NOT EXISTS "image_generation_audits_scope_idx"
  ON "image_generation_audits" ("project_id", "scene_id", "story_beat_id");
