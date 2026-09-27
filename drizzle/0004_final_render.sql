CREATE TYPE "audio_status" AS ENUM ('generating', 'completed', 'failed');
CREATE TYPE "render_status" AS ENUM ('queued', 'rendering', 'completed', 'failed');

ALTER TABLE "projects"
  ADD COLUMN "bgm_key" text DEFAULT 'default-ambient' NOT NULL;

ALTER TABLE "api_usage"
  ADD COLUMN "units" integer;

CREATE TABLE "audio_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "storyboard_id" uuid NOT NULL REFERENCES "storyboards"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "voice_id" text NOT NULL,
  "language" "project_language" NOT NULL,
  "status" "audio_status" DEFAULT 'generating' NOT NULL,
  "script" text NOT NULL,
  "character_count" integer NOT NULL,
  "duration_ms" integer,
  "object_key" text,
  "mime_type" text,
  "estimated_cost" real,
  "error_code" text,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

CREATE INDEX "audio_records_project_idx" ON "audio_records" ("project_id", "created_at");

CREATE TABLE "final_renders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "storyboard_id" uuid NOT NULL REFERENCES "storyboards"("id") ON DELETE cascade,
  "audio_record_id" uuid REFERENCES "audio_records"("id") ON DELETE set null,
  "version" integer NOT NULL,
  "status" "render_status" DEFAULT 'queued' NOT NULL,
  "width" integer DEFAULT 1080 NOT NULL,
  "height" integer DEFAULT 1920 NOT NULL,
  "fps" integer DEFAULT 30 NOT NULL,
  "duration_ms" integer,
  "bgm_key" text DEFAULT 'default-ambient' NOT NULL,
  "render_input" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "output_object_key" text,
  "estimated_cost" real DEFAULT 0 NOT NULL,
  "error_code" text,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

CREATE UNIQUE INDEX "final_renders_project_version_unique" ON "final_renders" ("project_id", "version");
CREATE INDEX "final_renders_project_status_idx" ON "final_renders" ("project_id", "status");

CREATE TABLE "render_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "render_id" uuid NOT NULL REFERENCES "final_renders"("id") ON DELETE cascade,
  "status" "render_status" DEFAULT 'queued' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "error_code" text,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

CREATE UNIQUE INDEX "render_jobs_render_unique" ON "render_jobs" ("render_id");
CREATE INDEX "render_jobs_project_status_idx" ON "render_jobs" ("project_id", "status");
