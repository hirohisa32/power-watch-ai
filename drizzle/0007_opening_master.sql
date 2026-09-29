CREATE TYPE "opening_status" AS ENUM ('queued', 'generating', 'rendering', 'completed', 'failed');

CREATE TABLE "opening_masters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text DEFAULT 'POWER_WATCH_OPENING_MASTER' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "status" "opening_status" DEFAULT 'queued' NOT NULL,
  "style" "project_style" DEFAULT 'cinematic_real' NOT NULL,
  "duration_ms" integer DEFAULT 15000 NOT NULL,
  "segment_object_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "provider_task_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "actual_cost_credits" real DEFAULT 0 NOT NULL,
  "actual_cost_usd" real DEFAULT 0 NOT NULL,
  "error_code" text,
  "error_message" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "completed_at" timestamptz,
  CONSTRAINT "opening_masters_key_version_unique" UNIQUE("key", "version")
);

CREATE TABLE "opening_previews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "opening_master_id" uuid NOT NULL REFERENCES "opening_masters"("id") ON DELETE restrict,
  "watch_asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE restrict,
  "status" "opening_status" DEFAULT 'queued' NOT NULL,
  "stage" text DEFAULT 'master' NOT NULL,
  "duration_ms" integer DEFAULT 20000 NOT NULL,
  "watch_task_id" text,
  "watch_object_key" text,
  "narration_object_key" text,
  "output_object_key" text,
  "runway_credits" real DEFAULT 0 NOT NULL,
  "runway_cost_usd" real DEFAULT 0 NOT NULL,
  "elevenlabs_cost_usd" real DEFAULT 0 NOT NULL,
  "audio_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_code" text,
  "error_message" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "completed_at" timestamptz
);
CREATE INDEX "opening_previews_project_status_idx" ON "opening_previews"("project_id", "status");

CREATE TABLE "opening_preview_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "preview_id" uuid NOT NULL REFERENCES "opening_previews"("id") ON DELETE cascade,
  "status" "opening_status" DEFAULT 'queued' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "error_code" text,
  "error_message" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "completed_at" timestamptz,
  CONSTRAINT "opening_preview_jobs_preview_unique" UNIQUE("preview_id")
);
