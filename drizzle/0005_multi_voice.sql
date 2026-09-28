CREATE TYPE "voice_role" AS ENUM ('narration', 'dialogue');
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "narrator_voice_id" text;
--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "narration_tone" text DEFAULT 'documentary' NOT NULL;
--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "dialogue" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
CREATE TABLE "voice_presets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "voice_id" text NOT NULL,
  "name" text NOT NULL,
  "gender" text DEFAULT 'male' NOT NULL,
  "roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tones" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source" text DEFAULT 'voice-library' NOT NULL,
  "approved" boolean DEFAULT true NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "voice_presets_key_unique" ON "voice_presets" ("key");
--> statement-breakpoint
CREATE UNIQUE INDEX "voice_presets_voice_id_unique" ON "voice_presets" ("voice_id");
--> statement-breakpoint
CREATE INDEX "voice_presets_approved_idx" ON "voice_presets" ("approved", "priority");
--> statement-breakpoint
CREATE TABLE "scene_voice_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "storyboard_id" uuid NOT NULL REFERENCES "storyboards"("id") ON DELETE cascade,
  "scene_id" uuid NOT NULL REFERENCES "scenes"("id") ON DELETE cascade,
  "speaker_key" text NOT NULL,
  "role" "voice_role" NOT NULL,
  "voice_preset_id" uuid REFERENCES "voice_presets"("id") ON DELETE set null,
  "voice_id" text NOT NULL,
  "tone" text DEFAULT 'neutral' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "scene_voice_assignment_unique" ON "scene_voice_assignments" ("scene_id", "speaker_key", "role");
--> statement-breakpoint
CREATE INDEX "scene_voice_assignments_project_idx" ON "scene_voice_assignments" ("project_id", "storyboard_id");
