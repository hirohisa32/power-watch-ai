DO $$ BEGIN
  CREATE TYPE "system_video_asset_type" AS ENUM ('opening', 'ending');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_video_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "type" "system_video_asset_type" NOT NULL,
  "brand" text NOT NULL,
  "display_name" text NOT NULL,
  "storage_path" text NOT NULL,
  "duration_ms" integer NOT NULL,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "fps" integer NOT NULL,
  "has_audio" boolean DEFAULT true NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "system_video_assets_key_unique" ON "system_video_assets" ("key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "system_video_assets_type_active_idx" ON "system_video_assets" ("type", "active");
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "opening_asset_id" uuid;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "ending_asset_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_opening_asset_id_system_video_assets_id_fk"
    FOREIGN KEY ("opening_asset_id") REFERENCES "public"."system_video_assets"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_ending_asset_id_system_video_assets_id_fk"
    FOREIGN KEY ("ending_asset_id") REFERENCES "public"."system_video_assets"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
INSERT INTO "system_video_assets" ("id", "key", "type", "brand", "display_name", "storage_path", "duration_ms", "width", "height", "fps", "has_audio", "active") VALUES
  ('10000000-0000-4000-8000-000000000001', 'opening_power_watch', 'opening', 'power_watch', 'Power Watch', 'system-assets/opening/opening_power_watch.mp4', 15072, 1080, 1920, 24, true, true),
  ('10000000-0000-4000-8000-000000000002', 'opening_cool_vintage_watch', 'opening', 'cool_vintage_watch', 'Cool Vintage Watch', 'system-assets/opening/opening_cool_vintage_watch.mp4', 15072, 720, 1280, 24, true, true),
  ('10000000-0000-4000-8000-000000000003', 'opening_trust_watch', 'opening', 'trust_watch', 'Trust Watch', 'system-assets/opening/opening_trust_watch.mp4', 15072, 1080, 1920, 24, true, true),
  ('10000000-0000-4000-8000-000000000011', 'ending_power_watch', 'ending', 'power_watch', 'Power Watch', 'system-assets/ending/ending_power_watch.mp4', 5000, 1080, 1920, 30, false, true),
  ('10000000-0000-4000-8000-000000000012', 'ending_cool_vintage_watch', 'ending', 'cool_vintage_watch', 'Cool Vintage Watch', 'system-assets/ending/ending_cool_vintage_watch.mp4', 5000, 1080, 1920, 30, false, true),
  ('10000000-0000-4000-8000-000000000013', 'ending_trust_watch', 'ending', 'trust_watch', 'Trust Watch', 'system-assets/ending/ending_trust_watch.mp4', 5000, 1080, 1920, 30, false, true)
ON CONFLICT ("key") DO UPDATE SET
  "type" = EXCLUDED."type", "brand" = EXCLUDED."brand", "display_name" = EXCLUDED."display_name",
  "storage_path" = EXCLUDED."storage_path", "duration_ms" = EXCLUDED."duration_ms",
  "width" = EXCLUDED."width", "height" = EXCLUDED."height", "fps" = EXCLUDED."fps",
  "has_audio" = EXCLUDED."has_audio", "active" = true, "updated_at" = now();
--> statement-breakpoint
UPDATE "projects" SET
  "opening_asset_id" = (SELECT "id" FROM "system_video_assets" WHERE "key" = 'opening_power_watch'),
  "ending_asset_id" = (SELECT "id" FROM "system_video_assets" WHERE "key" = 'ending_power_watch'),
  "narrator_voice_id" = 'CeKhvpl894bEZDsRgdlL',
  "narrator_selection_reason" = '通常生成は林さん / eleven_v4に固定'
WHERE "opening_asset_id" IS NULL OR "ending_asset_id" IS NULL OR "narrator_voice_id" IS DISTINCT FROM 'CeKhvpl894bEZDsRgdlL';
