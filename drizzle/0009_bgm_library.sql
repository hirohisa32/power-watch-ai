CREATE TABLE "bgm_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "file_path" text NOT NULL,
  "extension" text NOT NULL,
  "mime_type" text DEFAULT 'audio/mpeg' NOT NULL,
  "size_bytes" integer NOT NULL,
  "duration_ms" integer NOT NULL,
  "sample_rate" integer NOT NULL,
  "channels" integer NOT NULL,
  "genre" text NOT NULL,
  "mood" text NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "suitable_styles" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "analysis" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "provider" text,
  "license_type" text,
  "license_proof" text,
  "acquired_at" timestamp with time zone,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bgm_assets_key_unique" ON "bgm_assets" ("key");
--> statement-breakpoint
CREATE UNIQUE INDEX "bgm_assets_file_path_unique" ON "bgm_assets" ("file_path");
--> statement-breakpoint
CREATE INDEX "bgm_assets_active_idx" ON "bgm_assets" ("active", "name");
--> statement-breakpoint
UPDATE "projects" SET "bgm_key" = 'cinematic-product-company-opening' WHERE "bgm_key" = 'default-ambient';
