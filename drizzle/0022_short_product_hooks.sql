ALTER TABLE "scenes" DROP CONSTRAINT IF EXISTS "scenes_duration_check";--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_duration_check" CHECK ("duration" BETWEEN 1 AND 8);
