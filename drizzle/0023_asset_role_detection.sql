ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "human_label" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "detected_role" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "detection_confidence" real;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "human_locked" boolean DEFAULT false NOT NULL;

UPDATE "assets" SET "human_label" = "label" WHERE "human_label" IS NULL;

CREATE INDEX IF NOT EXISTS "assets_detected_role_idx"
  ON "assets" ("project_id", "detected_role");
