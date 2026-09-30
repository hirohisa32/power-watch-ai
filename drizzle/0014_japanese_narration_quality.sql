DO $$ BEGIN
  CREATE TYPE "narration_quality_status" AS ENUM ('pending', 'PASS', 'RETRY', 'HUMAN_REVIEW', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "japanese_reading_dictionary" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE cascade,
  "display" text NOT NULL,
  "reading" text NOT NULL,
  "source" text DEFAULT 'human' NOT NULL,
  "approved" boolean DEFAULT true NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "japanese_reading_dictionary_scope_unique" ON "japanese_reading_dictionary" ("project_id", "display");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "japanese_reading_dictionary_lookup_idx" ON "japanese_reading_dictionary" ("approved", "display");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "japanese_reading_dictionary_global_unique" ON "japanese_reading_dictionary" ("display") WHERE "project_id" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "narration_quality_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE cascade,
  "storyboard_id" uuid REFERENCES "storyboards"("id") ON DELETE cascade,
  "audio_record_id" uuid REFERENCES "audio_records"("id") ON DELETE set null,
  "status" "narration_quality_status" DEFAULT 'pending' NOT NULL,
  "display_script" text NOT NULL,
  "voice_id" text NOT NULL,
  "model" text NOT NULL,
  "segment_count" integer NOT NULL,
  "score_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "assembled_object_key" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "narration_quality_runs_project_idx" ON "narration_quality_runs" ("project_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "narration_quality_segments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "narration_quality_runs"("id") ON DELETE cascade,
  "segment_index" integer NOT NULL,
  "display_script" text NOT NULL,
  "tts_input_text" text NOT NULL,
  "expected_reading" text NOT NULL,
  "recognized_speech" text,
  "reading_map" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" "narration_quality_status" DEFAULT 'pending' NOT NULL,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "confidence" real,
  "raw_object_key" text,
  "normalized_object_key" text,
  "duration_seconds" real,
  "units" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "narration_quality_segments_run_index_unique" ON "narration_quality_segments" ("run_id", "segment_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "narration_quality_segments_status_idx" ON "narration_quality_segments" ("status", "updated_at");
--> statement-breakpoint
INSERT INTO "japanese_reading_dictionary" ("display", "reading", "source", "approved") VALUES
  ('1970年代', 'せんきゅうひゃくななじゅうねんだい', 'system', true),
  ('変革期', 'へんかくき', 'system', true),
  ('カンジャル', 'カンジャル', 'system', true),
  ('国家', 'こっか', 'system', true),
  ('ASPREY', 'アスプレイ', 'system', true),
  ('Sea-Dweller', 'シードゥエラー', 'system', true),
  ('Rolex', 'ロレックス', 'system', true)
ON CONFLICT DO NOTHING;
