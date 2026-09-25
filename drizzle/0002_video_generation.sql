CREATE TYPE "video_generation_status" AS ENUM ('queued', 'generating', 'completed', 'failed', 'canceled');
CREATE TYPE "video_job_status" AS ENUM ('queued', 'processing', 'completed', 'failed', 'canceled');

CREATE TABLE "video_generations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "scene_id" uuid NOT NULL REFERENCES "scenes"("id") ON DELETE cascade,
  "version" integer NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "status" "video_generation_status" DEFAULT 'queued' NOT NULL,
  "prompt" text NOT NULL,
  "regeneration_instruction" text,
  "reference_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "requested_duration" integer NOT NULL,
  "output_object_key" text,
  "estimated_cost_credits" real,
  "estimated_cost_usd" real,
  "actual_cost_credits" real,
  "actual_cost_usd" real,
  "error_code" text,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
CREATE UNIQUE INDEX "video_generations_scene_version_unique" ON "video_generations" ("scene_id", "version");
CREATE INDEX "video_generations_project_status_idx" ON "video_generations" ("project_id", "status");

CREATE TABLE "video_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "scene_id" uuid NOT NULL REFERENCES "scenes"("id") ON DELETE cascade,
  "generation_id" uuid NOT NULL REFERENCES "video_generations"("id") ON DELETE cascade,
  "provider_task_id" text,
  "status" "video_job_status" DEFAULT 'queued' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "error_code" text,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
CREATE UNIQUE INDEX "video_jobs_generation_unique" ON "video_jobs" ("generation_id");
CREATE INDEX "video_jobs_project_status_idx" ON "video_jobs" ("project_id", "status");

ALTER TABLE "scenes" ADD COLUMN "selected_generation_id" uuid;
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_selected_generation_id_video_generations_id_fk"
  FOREIGN KEY ("selected_generation_id") REFERENCES "video_generations"("id") ON DELETE SET NULL;
