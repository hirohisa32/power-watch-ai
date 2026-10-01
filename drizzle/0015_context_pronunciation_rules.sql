CREATE TABLE IF NOT EXISTS "context_pronunciation_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE cascade,
  "target_term" text NOT NULL,
  "display_pattern" text NOT NULL,
  "tts_template" text NOT NULL,
  "problem" text NOT NULL,
  "semantic_policy" text DEFAULT 'same_meaning_only' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "source" text DEFAULT 'human_calibration' NOT NULL,
  "approved_voice_id" text,
  "notes" text,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "context_pronunciation_rules_scope_unique" ON "context_pronunciation_rules" ("project_id", "display_pattern", "tts_template");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "context_pronunciation_rules_global_unique" ON "context_pronunciation_rules" ("display_pattern", "tts_template") WHERE "project_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "context_pronunciation_rules_lookup_idx" ON "context_pronunciation_rules" ("status", "target_term");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pronunciation_calibration_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "target_term" text NOT NULL,
  "voice_id" text NOT NULL,
  "test_id" text NOT NULL,
  "display_script" text NOT NULL,
  "tts_input_text" text NOT NULL,
  "verdict" text NOT NULL,
  "human_notes" text NOT NULL,
  "calibrated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pronunciation_calibration_result_unique" ON "pronunciation_calibration_results" ("target_term", "voice_id", "test_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pronunciation_calibration_target_idx" ON "pronunciation_calibration_results" ("target_term", "calibrated_at");
--> statement-breakpoint
INSERT INTO "pronunciation_calibration_results" ("target_term", "voice_id", "test_id", "display_script", "tts_input_text", "verdict", "human_notes")
SELECT 'オマーン', voice_id, test_id, display_script, display_script,
  CASE WHEN test_id = 'test-4' THEN 'natural' ELSE 'unnatural' END,
  CASE WHEN test_id = 'test-4'
    THEN 'Human確認：オマーンという国。のみ日本語ネイティブとして自然'
    ELSE 'Human確認：日本語ネイティブとして不自然' END
FROM (VALUES
  ('Bj4Malc5SZLoXfPtxRxH', 'test-1', 'オマーン。'),
  ('Bj4Malc5SZLoXfPtxRxH', 'test-2', '変革期のオマーン。'),
  ('Bj4Malc5SZLoXfPtxRxH', 'test-3', '中東のオマーン。'),
  ('Bj4Malc5SZLoXfPtxRxH', 'test-4', 'オマーンという国。'),
  ('Bj4Malc5SZLoXfPtxRxH', 'test-5', '1970年代、変革期のオマーン。'),
  ('hV5AJXCCNGT56GPYPLiG', 'test-1', 'オマーン。'),
  ('hV5AJXCCNGT56GPYPLiG', 'test-2', '変革期のオマーン。'),
  ('hV5AJXCCNGT56GPYPLiG', 'test-3', '中東のオマーン。'),
  ('hV5AJXCCNGT56GPYPLiG', 'test-4', 'オマーンという国。'),
  ('hV5AJXCCNGT56GPYPLiG', 'test-5', '1970年代、変革期のオマーン。')
) AS calibration(voice_id, test_id, display_script)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "context_pronunciation_rules" ("target_term", "display_pattern", "tts_template", "problem", "status", "notes") VALUES
  ('オマーン', '1970年代、変革期のオマーン。', '1970年代、変革期を迎えていた、オマーンという国。', '単語単体または文末位置では日本語アクセントが不自然', 'pending', 'TEST A。Human試聴後にのみ承認する候補'),
  ('オマーン', '時を超えて受け継がれる、オマーンの物語です。', '時を超えて受け継がれる、オマーンという国の物語です。', '単語単体または文末位置では日本語アクセントが不自然', 'pending', 'TEST C。Human試聴後にのみ承認する候補')
ON CONFLICT DO NOTHING;
