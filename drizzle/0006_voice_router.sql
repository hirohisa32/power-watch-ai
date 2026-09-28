ALTER TABLE "projects" ADD COLUMN "narrator_selection_reason" text;
--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "voice_id" text;
--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "voice_selection_source" text;
--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "voice_selection_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "scene_voice_assignments" ADD COLUMN "selection_source" text DEFAULT 'default_fallback' NOT NULL;
--> statement-breakpoint
ALTER TABLE "scene_voice_assignments" ADD COLUMN "selection_reason" text;
--> statement-breakpoint
ALTER TABLE "scene_voice_assignments" ADD COLUMN "selection_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "scene_voice_assignments" ADD COLUMN "manual_override" boolean DEFAULT false NOT NULL;
