DO $$ BEGIN
  CREATE TYPE "image_generation_status" AS ENUM ('generating', 'quality_gate', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "video_generations" ADD COLUMN IF NOT EXISTS "keyframe_image_id" uuid;
--> statement-breakpoint
ALTER TABLE "video_generations" ADD COLUMN IF NOT EXISTS "pipeline_stage" text DEFAULT 'preparing' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "image_generation_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "video_id" uuid NOT NULL REFERENCES "video_generations"("id") ON DELETE cascade,
  "scene_id" uuid NOT NULL REFERENCES "scenes"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "purpose" text NOT NULL,
  "status" "image_generation_status" DEFAULT 'generating' NOT NULL,
  "prompt" text NOT NULL,
  "character_key" text,
  "reference_object_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "output_object_key" text,
  "image_input_tokens" integer DEFAULT 0 NOT NULL,
  "image_output_tokens" integer DEFAULT 0 NOT NULL,
  "text_input_tokens" integer DEFAULT 0 NOT NULL,
  "cost_usd" real DEFAULT 0 NOT NULL,
  "quality_gate" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "request_id" text,
  "error_code" text,
  "error_message" text,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "image_generation_audits_project_idx" ON "image_generation_audits" ("project_id", "generated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "image_generation_audits_video_idx" ON "image_generation_audits" ("video_id", "generated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "image_generation_audits_scene_idx" ON "image_generation_audits" ("scene_id", "generated_at");
