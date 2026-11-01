ALTER TABLE "system_video_assets"
  ADD COLUMN IF NOT EXISTS "recommended_start_ms" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "recommended_end_ms" integer,
  ADD COLUMN IF NOT EXISTS "recommended_duration_ms" integer;

ALTER TABLE "assets"
  ADD COLUMN IF NOT EXISTS "role" text,
  ADD COLUMN IF NOT EXISTS "analysis" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "scenes"
  ADD COLUMN IF NOT EXISTS "narration_segment_id" text,
  ADD COLUMN IF NOT EXISTS "visual_intent" text,
  ADD COLUMN IF NOT EXISTS "visual_subject" text,
  ADD COLUMN IF NOT EXISTS "historical_period" text,
  ADD COLUMN IF NOT EXISTS "character_id" text,
  ADD COLUMN IF NOT EXISTS "product_photo_id" uuid REFERENCES "assets"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "product_photo_role" text,
  ADD COLUMN IF NOT EXISTS "visual_type" text,
  ADD COLUMN IF NOT EXISTS "visual_relevance_score" integer,
  ADD COLUMN IF NOT EXISTS "visual_relevance_status" text;

ALTER TABLE "audio_records"
  ADD COLUMN IF NOT EXISTS "alignment" jsonb;

UPDATE "system_video_assets"
SET
  "recommended_start_ms" = 0,
  "recommended_duration_ms" = LEAST("duration_ms", 3500),
  "recommended_end_ms" = LEAST("duration_ms", 3500)
WHERE "type" = 'ending' AND "recommended_duration_ms" IS NULL;

UPDATE "scenes"
SET
  "narration_segment_id" = COALESCE("narration_segment_id", 'segment-' || lpad("order"::text, 2, '0')),
  "visual_intent" = COALESCE("visual_intent", "visual_description"),
  "visual_subject" = COALESCE("visual_subject", "title"),
  "historical_period" = COALESCE("historical_period", "year"),
  "visual_type" = COALESCE("visual_type", CASE WHEN "watch_reference" THEN 'product_photo' ELSE 'story' END)
WHERE "narration_segment_id" IS NULL
   OR "visual_intent" IS NULL
   OR "visual_subject" IS NULL
   OR "visual_type" IS NULL;
