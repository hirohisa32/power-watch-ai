import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
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
export const voiceRole = pgEnum("voice_role", ["narration", "dialogue"]);
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
    status: projectStatus("status").default("draft").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("projects_user_updated_idx").on(table.userId, table.updatedAt)],
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("scene_voice_assignment_unique").on(
      table.sceneId,
      table.speakerKey,
      table.role,
    ),
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

export type Project = typeof projects.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Storyboard = typeof storyboards.$inferSelect;
export type Scene = typeof scenes.$inferSelect;
export type VideoGeneration = typeof videoGenerations.$inferSelect;
export type VideoJob = typeof videoJobs.$inferSelect;
export type AudioRecord = typeof audioRecords.$inferSelect;
export type VoicePreset = typeof voicePresets.$inferSelect;
export type SceneVoiceAssignment = typeof sceneVoiceAssignments.$inferSelect;
export type FinalRender = typeof finalRenders.$inferSelect;
export type RenderJob = typeof renderJobs.$inferSelect;
