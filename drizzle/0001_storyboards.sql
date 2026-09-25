CREATE TYPE "public"."scene_preset" AS ENUM('Opening', 'VintageRoom', 'OldBook', 'WatchReveal', 'HistoricalCharacter', 'HistoricalEvent', 'Racing', 'CityEraEstablishing', 'WristShot', 'WatchMacro', 'ProductHero', 'YearLocationTitle', 'Ending');--> statement-breakpoint
CREATE TABLE "storyboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"total_duration" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storyboard_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"preset" "scene_preset" NOT NULL,
	"title" text NOT NULL,
	"duration" integer NOT NULL,
	"narration" text NOT NULL,
	"subtitle" text NOT NULL,
	"visual_description" text NOT NULL,
	"visual_prompt" text NOT NULL,
	"camera" text NOT NULL,
	"shot_type" text NOT NULL,
	"lighting" text NOT NULL,
	"motion" text NOT NULL,
	"color_mood" text NOT NULL,
	"transition" text NOT NULL,
	"watch_reference" boolean DEFAULT false NOT NULL,
	"preferred_asset_labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"year" text,
	"location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scenes_duration_check" CHECK ("duration" BETWEEN 3 AND 8)
);--> statement-breakpoint
CREATE TABLE "api_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"request_id" text,
	"duration_ms" integer NOT NULL,
	"estimated_cost" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "storyboards" ADD CONSTRAINT "storyboards_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_storyboard_id_storyboards_id_fk" FOREIGN KEY ("storyboard_id") REFERENCES "public"."storyboards"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "storyboards_project_idx" ON "storyboards" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storyboards_one_active_per_project" ON "storyboards" USING btree ("project_id") WHERE "is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "scenes_storyboard_order_unique" ON "scenes" USING btree ("storyboard_id", "order");--> statement-breakpoint
CREATE INDEX "scenes_project_idx" ON "scenes" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "api_usage_project_idx" ON "api_usage" USING btree ("project_id", "created_at");
