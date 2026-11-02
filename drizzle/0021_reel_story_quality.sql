ALTER TABLE "projects"
ADD COLUMN IF NOT EXISTS "narration_subtitles_enabled" boolean DEFAULT true NOT NULL;

ALTER TABLE "storyboards"
ADD COLUMN IF NOT EXISTS "story_quality" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "storyboards"
ADD COLUMN IF NOT EXISTS "story_quality_status" text;

ALTER TABLE "scenes"
ADD COLUMN IF NOT EXISTS "include_in_final" boolean DEFAULT true NOT NULL;

ALTER TABLE "scenes"
ADD COLUMN IF NOT EXISTS "story_phase" text;
