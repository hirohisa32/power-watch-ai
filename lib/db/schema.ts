import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const projectStyle = pgEnum("project_style", ["cinematic_real", "animation"]);
export const projectLanguage = pgEnum("project_language", ["ja", "en", "zh"]);
export const projectStatus = pgEnum("project_status", [
  "draft",
  "storyboard",
  "generating",
  "completed",
  "failed",
]);
export const assetType = pgEnum("asset_type", ["watch_image"]);
export const videoGenerationStatus = pgEnum("video_generation_status", [
  "queued",
  "generating",
  "completed",
  "failed",
  "canceled",
]);
export const videoJobStatus = pgEnum("video_job_status", [
  "queued",
  "processing",
  "completed",
  "failed",
  "canceled",
]);
export const audioStatus = pgEnum("audio_status", ["generating", "completed", "failed"]);
export const renderStatus = pgEnum("render_status", ["queued", "rendering", "completed", "failed"]);
export const openingStatus = pgEnum("opening_status", [
  "queued",
  "generating",
  "rendering",
  "completed",
  "failed",
]);
export const costSettlementStatus = pgEnum("cost_settlement_status", ["pending_rate", "fixed"]);
export const monthlyBillingStatus = pgEnum("monthly_billing_status", ["open", "closed"]);
export const voiceRole = pgEnum("voice_role", ["narration", "dialogue"]);
export const narrationQualityStatus = pgEnum("narration_quality_status", [
  "pending",
  "PASS",
  "RETRY",
  "HUMAN_REVIEW",
  "failed",
]);
export const scenePreset = pgEnum("scene_preset", [
  "Opening",
  "VintageRoom",
  "OldBook",
  "WatchReveal",
  "HistoricalCharacter",
  "HistoricalEvent",
  "Racing",
  "CityEraEstablishing",
  "WristShot",
  "WatchMacro",
  "ProductHero",
  "YearLocationTitle",
  "Ending",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    script: text("script").notNull(),
    style: projectStyle("style").notNull(),
    language: projectLanguage("language").notNull(),
    targetDuration: integer("target_duration").notNull(),
    bgmKey: text("bgm_key").default("default-ambient").notNull(),
    narratorVoiceId: text("narrator_voice_id"),
    narratorSelectionReason: text("narrator_selection_reason"),
    status: projectStatus("status").default("draft").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("projects_user_updated_idx").on(table.userId, table.updatedAt)],
);

export const bgmAssets = pgTable(
  "bgm_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    filePath: text("file_path").notNull(),
    extension: text("extension").notNull(),
    mimeType: text("mime_type").default("audio/mpeg").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    durationMs: integer("duration_ms").notNull(),
    sampleRate: integer("sample_rate").notNull(),
    channels: integer("channels").notNull(),
    genre: text("genre").notNull(),
    mood: text("mood").notNull(),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    suitableStyles: jsonb("suitable_styles").$type<string[]>().default([]).notNull(),
    analysis: jsonb("analysis").$type<Record<string, unknown>>().default({}).notNull(),
    provider: text("provider"),
    licenseType: text("license_type"),
    licenseProof: text("license_proof"),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("bgm_assets_key_unique").on(table.key),
    uniqueIndex("bgm_assets_file_path_unique").on(table.filePath),
    index("bgm_assets_active_idx").on(table.active, table.name),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: assetType("type").notNull(),
    label: text("label").notNull(),
    objectKey: text("object_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("assets_project_idx").on(table.projectId)],
);

export const storyboards = pgTable(
  "storyboards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    totalDuration: integer("total_duration").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("storyboards_project_idx").on(table.projectId),
    uniqueIndex("storyboards_one_active_per_project")
      .on(table.projectId)
      .where(sql`${table.isActive} = true`),
  ],
);

export const scenes = pgTable(
  "scenes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storyboardId: uuid("storyboard_id")
      .notNull()
      .references(() => storyboards.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    preset: scenePreset("preset").notNull(),
    title: text("title").notNull(),
    duration: integer("duration").notNull(),
    narration: text("narration").notNull(),
    narrationTone: text("narration_tone").default("documentary").notNull(),
    dialogue: jsonb("dialogue")
      .$type<Array<{ speaker: string; text: string; tone: string }>>()
      .default([])
      .notNull(),
    voiceId: text("voice_id"),
    voiceSelectionSource: text("voice_selection_source"),
    voiceSelectionMetadata: jsonb("voice_selection_metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    subtitle: text("subtitle").notNull(),
    visualDescription: text("visual_description").notNull(),
    visualPrompt: text("visual_prompt").notNull(),
    camera: text("camera").notNull(),
    shotType: text("shot_type").notNull(),
    lighting: text("lighting").notNull(),
    motion: text("motion").notNull(),
    colorMood: text("color_mood").notNull(),
    transition: text("transition").notNull(),
    watchReference: boolean("watch_reference").default(false).notNull(),
    preferredAssetLabels: jsonb("preferred_asset_labels").$type<string[]>().default([]).notNull(),
    year: text("year"),
    location: text("location"),
    selectedGenerationId: uuid("selected_generation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("scenes_storyboard_order_unique").on(table.storyboardId, table.order),
    index("scenes_project_idx").on(table.projectId),
    check("scenes_duration_check", sql`${table.duration} BETWEEN 3 AND 8`),
  ],
);

export const videoGenerations = pgTable(
  "video_generations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    status: videoGenerationStatus("status").default("queued").notNull(),
    prompt: text("prompt").notNull(),
    regenerationInstruction: text("regeneration_instruction"),
    referenceAssetIds: jsonb("reference_asset_ids").$type<string[]>().default([]).notNull(),
    requestedDuration: integer("requested_duration").notNull(),
    outputObjectKey: text("output_object_key"),
    estimatedCostCredits: real("estimated_cost_credits"),
    estimatedCostUsd: real("estimated_cost_usd"),
    actualCostCredits: real("actual_cost_credits"),
    actualCostUsd: real("actual_cost_usd"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("video_generations_scene_version_unique").on(table.sceneId, table.version),
    index("video_generations_project_status_idx").on(table.projectId, table.status),
  ],
);

export const videoJobs = pgTable(
  "video_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    generationId: uuid("generation_id")
      .notNull()
      .references(() => videoGenerations.id, { onDelete: "cascade" }),
    providerTaskId: text("provider_task_id"),
    status: videoJobStatus("status").default("queued").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("video_jobs_generation_unique").on(table.generationId),
    index("video_jobs_project_status_idx").on(table.projectId, table.status),
  ],
);

export const apiUsage = pgTable(
  "api_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    operation: text("operation").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens"),
    cachedInputTokens: integer("cached_input_tokens"),
    outputTokens: integer("output_tokens"),
    units: integer("units"),
    requestId: text("request_id"),
    durationMs: integer("duration_ms").notNull(),
    estimatedCost: real("estimated_cost"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("api_usage_project_idx").on(table.projectId, table.createdAt)],
);

export const audioRecords = pgTable(
  "audio_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    storyboardId: uuid("storyboard_id")
      .notNull()
      .references(() => storyboards.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    voiceId: text("voice_id").notNull(),
    language: projectLanguage("language").notNull(),
    status: audioStatus("status").default("generating").notNull(),
    script: text("script").notNull(),
    characterCount: integer("character_count").notNull(),
    durationMs: integer("duration_ms"),
    objectKey: text("object_key"),
    mimeType: text("mime_type"),
    estimatedCost: real("estimated_cost"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("audio_records_project_idx").on(table.projectId, table.createdAt)],
);

export const elevenLabsGenerationAudits = pgTable(
  "elevenlabs_generation_audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    storyboardId: uuid("storyboard_id").references(() => storyboards.id, { onDelete: "cascade" }),
    audioRecordId: uuid("audio_record_id").references(() => audioRecords.id, {
      onDelete: "set null",
    }),
    purpose: text("purpose").notNull(),
    originalScript: text("original_script").notNull(),
    displayScript: text("display_script").notNull(),
    ttsInputText: text("tts_input_text").notNull(),
    readingMap: jsonb("reading_map").$type<Array<Record<string, unknown>>>().default([]).notNull(),
    voiceId: text("voice_id").notNull(),
    model: text("model").notNull(),
    voiceSettings: jsonb("voice_settings").$type<Record<string, unknown>>().notNull(),
    language: text("language").notNull(),
    outputFormat: text("output_format").notNull(),
    seed: integer("seed"),
    applyTextNormalization: text("apply_text_normalization").notNull(),
    applyLanguageTextNormalization: boolean("apply_language_text_normalization")
      .default(false)
      .notNull(),
    requestId: text("request_id"),
    characterCost: integer("character_cost"),
    estimatedCost: real("estimated_cost"),
    durationSeconds: real("duration_seconds"),
    status: text("status").default("completed").notNull(),
    errorMessage: text("error_message"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("elevenlabs_generation_audits_project_idx").on(table.projectId, table.generatedAt),
    index("elevenlabs_generation_audits_generated_idx").on(table.generatedAt),
  ],
);

export const japaneseReadingDictionary = pgTable(
  "japanese_reading_dictionary",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    display: text("display").notNull(),
    reading: text("reading").notNull(),
    source: text("source").default("human").notNull(),
    approved: boolean("approved").default(true).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("japanese_reading_dictionary_scope_unique").on(table.projectId, table.display),
    index("japanese_reading_dictionary_lookup_idx").on(table.approved, table.display),
  ],
);

export const contextPronunciationRules = pgTable(
  "context_pronunciation_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    targetTerm: text("target_term").notNull(),
    displayPattern: text("display_pattern").notNull(),
    ttsTemplate: text("tts_template").notNull(),
    problem: text("problem").notNull(),
    semanticPolicy: text("semantic_policy").default("same_meaning_only").notNull(),
    status: text("status").default("pending").notNull(),
    source: text("source").default("human_calibration").notNull(),
    approvedVoiceId: text("approved_voice_id"),
    notes: text("notes"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("context_pronunciation_rules_scope_unique").on(table.projectId, table.displayPattern, table.ttsTemplate),
    index("context_pronunciation_rules_lookup_idx").on(table.status, table.targetTerm),
  ],
);

export const pronunciationCalibrationResults = pgTable(
  "pronunciation_calibration_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    targetTerm: text("target_term").notNull(),
    voiceId: text("voice_id").notNull(),
    testId: text("test_id").notNull(),
    displayScript: text("display_script").notNull(),
    ttsInputText: text("tts_input_text").notNull(),
    verdict: text("verdict").notNull(),
    humanNotes: text("human_notes").notNull(),
    calibratedAt: timestamp("calibrated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("pronunciation_calibration_result_unique").on(table.targetTerm, table.voiceId, table.testId),
    index("pronunciation_calibration_target_idx").on(table.targetTerm, table.calibratedAt),
  ],
);

export const narrationQualityRuns = pgTable(
  "narration_quality_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    storyboardId: uuid("storyboard_id").references(() => storyboards.id, { onDelete: "cascade" }),
    audioRecordId: uuid("audio_record_id").references(() => audioRecords.id, { onDelete: "set null" }),
    status: narrationQualityStatus("status").default("pending").notNull(),
    displayScript: text("display_script").notNull(),
    voiceId: text("voice_id").notNull(),
    model: text("model").notNull(),
    segmentCount: integer("segment_count").notNull(),
    scoreSummary: jsonb("score_summary").$type<Record<string, unknown>>().default({}).notNull(),
    assembledObjectKey: text("assembled_object_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("narration_quality_runs_project_idx").on(table.projectId, table.createdAt)],
);

export const narrationQualitySegments = pgTable(
  "narration_quality_segments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id").notNull().references(() => narrationQualityRuns.id, { onDelete: "cascade" }),
    segmentIndex: integer("segment_index").notNull(),
    displayScript: text("display_script").notNull(),
    ttsInputText: text("tts_input_text").notNull(),
    expectedReading: text("expected_reading").notNull(),
    recognizedSpeech: text("recognized_speech"),
    readingMap: jsonb("reading_map").$type<Array<Record<string, unknown>>>().default([]).notNull(),
    status: narrationQualityStatus("status").default("pending").notNull(),
    retryCount: integer("retry_count").default(0).notNull(),
    reasons: jsonb("reasons").$type<string[]>().default([]).notNull(),
    scores: jsonb("scores").$type<Record<string, number>>().default({}).notNull(),
    confidence: real("confidence"),
    rawObjectKey: text("raw_object_key"),
    normalizedObjectKey: text("normalized_object_key"),
    durationSeconds: real("duration_seconds"),
    units: integer("units"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("narration_quality_segments_run_index_unique").on(table.runId, table.segmentIndex),
    index("narration_quality_segments_status_idx").on(table.status, table.updatedAt),
  ],
);

export const voicePresets = pgTable(
  "voice_presets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    voiceId: text("voice_id").notNull(),
    name: text("name").notNull(),
    gender: text("gender").default("male").notNull(),
    roles: jsonb("roles").$type<Array<"narration" | "dialogue">>().default([]).notNull(),
    tones: jsonb("tones").$type<string[]>().default([]).notNull(),
    languages: jsonb("languages").$type<Array<"ja" | "en" | "zh">>().default([]).notNull(),
    source: text("source").default("voice-library").notNull(),
    approved: boolean("approved").default(true).notNull(),
    priority: integer("priority").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("voice_presets_key_unique").on(table.key),
    uniqueIndex("voice_presets_voice_id_unique").on(table.voiceId),
    index("voice_presets_approved_idx").on(table.approved, table.priority),
  ],
);

export const sceneVoiceAssignments = pgTable(
  "scene_voice_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    storyboardId: uuid("storyboard_id")
      .notNull()
      .references(() => storyboards.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    speakerKey: text("speaker_key").notNull(),
    role: voiceRole("role").notNull(),
    voicePresetId: uuid("voice_preset_id").references(() => voicePresets.id, {
      onDelete: "set null",
    }),
    voiceId: text("voice_id").notNull(),
    tone: text("tone").default("neutral").notNull(),
    selectionSource: text("selection_source").default("default_fallback").notNull(),
    selectionReason: text("selection_reason"),
    selectionMetadata: jsonb("selection_metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    manualOverride: boolean("manual_override").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("scene_voice_assignment_unique").on(table.sceneId, table.speakerKey, table.role),
    index("scene_voice_assignments_project_idx").on(table.projectId, table.storyboardId),
  ],
);

export const finalRenders = pgTable(
  "final_renders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    storyboardId: uuid("storyboard_id")
      .notNull()
      .references(() => storyboards.id, { onDelete: "cascade" }),
    audioRecordId: uuid("audio_record_id").references(() => audioRecords.id, {
      onDelete: "set null",
    }),
    version: integer("version").notNull(),
    status: renderStatus("status").default("queued").notNull(),
    width: integer("width").default(1080).notNull(),
    height: integer("height").default(1920).notNull(),
    fps: integer("fps").default(30).notNull(),
    durationMs: integer("duration_ms"),
    bgmKey: text("bgm_key").default("default-ambient").notNull(),
    renderInput: jsonb("render_input").default({}).notNull(),
    outputObjectKey: text("output_object_key"),
    estimatedCost: real("estimated_cost").default(0).notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("final_renders_project_version_unique").on(table.projectId, table.version),
    index("final_renders_project_status_idx").on(table.projectId, table.status),
  ],
);

export const monthlyBillingSettlements = pgTable(
  "monthly_billing_settlements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    billingMonth: text("billing_month").notNull(),
    totalJpy: integer("total_jpy").default(0).notNull(),
    projectCount: integer("project_count").default(0).notNull(),
    status: monthlyBillingStatus("status").default("open").notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("monthly_billing_settlements_month_unique").on(table.billingMonth),
    index("monthly_billing_settlements_status_idx").on(table.status, table.billingMonth),
  ],
);

export const projectCostSettlements = pgTable(
  "project_cost_settlements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    renderId: uuid("render_id")
      .notNull()
      .references(() => finalRenders.id, { onDelete: "restrict" }),
    monthlyBillingSettlementId: uuid("monthly_billing_settlement_id").references(
      () => monthlyBillingSettlements.id,
      { onDelete: "restrict" },
    ),
    totalCostUsd: numeric("total_cost_usd", { precision: 14, scale: 6, mode: "number" }).notNull(),
    previousTotalCostUsd: numeric("previous_total_cost_usd", {
      precision: 14,
      scale: 6,
      mode: "number",
    })
      .default(0)
      .notNull(),
    incrementalCostUsd: numeric("incremental_cost_usd", {
      precision: 14,
      scale: 6,
      mode: "number",
    }).notNull(),
    exchangeRateUsdJpy: numeric("exchange_rate_usd_jpy", {
      precision: 14,
      scale: 6,
      mode: "number",
    }),
    totalCostJpy: integer("total_cost_jpy"),
    incrementalCostJpy: integer("incremental_cost_jpy"),
    exchangeRateSource: text("exchange_rate_source"),
    ratePublishedAt: timestamp("rate_published_at", { withTimezone: true }),
    fixedAt: timestamp("fixed_at", { withTimezone: true }),
    billingMonth: text("billing_month"),
    costThrough: timestamp("cost_through", { withTimezone: true }).notNull(),
    status: costSettlementStatus("status").default("pending_rate").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("project_cost_settlements_render_unique").on(table.renderId),
    index("project_cost_settlements_project_fixed_idx").on(table.projectId, table.fixedAt),
    index("project_cost_settlements_billing_month_idx").on(table.billingMonth, table.status),
  ],
);

export const renderJobs = pgTable(
  "render_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    renderId: uuid("render_id")
      .notNull()
      .references(() => finalRenders.id, { onDelete: "cascade" }),
    status: renderStatus("status").default("queued").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("render_jobs_render_unique").on(table.renderId),
    index("render_jobs_project_status_idx").on(table.projectId, table.status),
  ],
);

export const openingMasters = pgTable(
  "opening_masters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").default("POWER_WATCH_OPENING_MASTER").notNull(),
    version: integer("version").default(1).notNull(),
    status: openingStatus("status").default("queued").notNull(),
    style: projectStyle("style").default("cinematic_real").notNull(),
    durationMs: integer("duration_ms").default(15000).notNull(),
    segmentObjectKeys: jsonb("segment_object_keys").$type<string[]>().default([]).notNull(),
    providerTaskIds: jsonb("provider_task_ids").$type<string[]>().default([]).notNull(),
    actualCostCredits: real("actual_cost_credits").default(0).notNull(),
    actualCostUsd: real("actual_cost_usd").default(0).notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("opening_masters_key_version_unique").on(table.key, table.version)],
);

export const openingPreviews = pgTable(
  "opening_previews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    openingMasterId: uuid("opening_master_id")
      .notNull()
      .references(() => openingMasters.id, { onDelete: "restrict" }),
    watchAssetId: uuid("watch_asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "restrict" }),
    status: openingStatus("status").default("queued").notNull(),
    stage: text("stage").default("master").notNull(),
    durationMs: integer("duration_ms").default(20000).notNull(),
    watchTaskId: text("watch_task_id"),
    watchObjectKey: text("watch_object_key"),
    narrationObjectKey: text("narration_object_key"),
    outputObjectKey: text("output_object_key"),
    runwayCredits: real("runway_credits").default(0).notNull(),
    runwayCostUsd: real("runway_cost_usd").default(0).notNull(),
    elevenlabsCostUsd: real("elevenlabs_cost_usd").default(0).notNull(),
    audioMetrics: jsonb("audio_metrics").$type<Record<string, unknown>>().default({}).notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("opening_previews_project_status_idx").on(table.projectId, table.status)],
);

export const openingPreviewJobs = pgTable(
  "opening_preview_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    previewId: uuid("preview_id")
      .notNull()
      .references(() => openingPreviews.id, { onDelete: "cascade" }),
    status: openingStatus("status").default("queued").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("opening_preview_jobs_preview_unique").on(table.previewId)],
);

export type Project = typeof projects.$inferSelect;
export type BgmAsset = typeof bgmAssets.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Storyboard = typeof storyboards.$inferSelect;
export type Scene = typeof scenes.$inferSelect;
export type VideoGeneration = typeof videoGenerations.$inferSelect;
export type VideoJob = typeof videoJobs.$inferSelect;
export type AudioRecord = typeof audioRecords.$inferSelect;
export type ElevenLabsGenerationAudit = typeof elevenLabsGenerationAudits.$inferSelect;
export type JapaneseReadingDictionaryEntry = typeof japaneseReadingDictionary.$inferSelect;
export type NarrationQualityRun = typeof narrationQualityRuns.$inferSelect;
export type NarrationQualitySegment = typeof narrationQualitySegments.$inferSelect;
export type VoicePreset = typeof voicePresets.$inferSelect;
export type SceneVoiceAssignment = typeof sceneVoiceAssignments.$inferSelect;
export type FinalRender = typeof finalRenders.$inferSelect;
export type RenderJob = typeof renderJobs.$inferSelect;
export type OpeningMaster = typeof openingMasters.$inferSelect;
export type OpeningPreview = typeof openingPreviews.$inferSelect;
