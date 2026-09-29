CREATE TYPE "cost_settlement_status" AS ENUM ('pending_rate', 'fixed');
CREATE TYPE "monthly_billing_status" AS ENUM ('open', 'closed');

CREATE TABLE "monthly_billing_settlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "billing_month" text NOT NULL,
  "total_jpy" integer DEFAULT 0 NOT NULL,
  "project_count" integer DEFAULT 0 NOT NULL,
  "status" "monthly_billing_status" DEFAULT 'open' NOT NULL,
  "closed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "monthly_billing_settlements_month_unique" UNIQUE("billing_month"),
  CONSTRAINT "monthly_billing_settlements_month_check" CHECK ("billing_month" ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT "monthly_billing_settlements_totals_check" CHECK ("total_jpy" >= 0 AND "project_count" >= 0)
);
CREATE INDEX "monthly_billing_settlements_status_idx" ON "monthly_billing_settlements"("status", "billing_month");

CREATE TABLE "project_cost_settlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "render_id" uuid NOT NULL REFERENCES "final_renders"("id") ON DELETE restrict,
  "monthly_billing_settlement_id" uuid REFERENCES "monthly_billing_settlements"("id") ON DELETE restrict,
  "total_cost_usd" numeric(14, 6) NOT NULL,
  "previous_total_cost_usd" numeric(14, 6) DEFAULT 0 NOT NULL,
  "incremental_cost_usd" numeric(14, 6) NOT NULL,
  "exchange_rate_usd_jpy" numeric(14, 6),
  "total_cost_jpy" integer,
  "incremental_cost_jpy" integer,
  "exchange_rate_source" text,
  "rate_published_at" timestamptz,
  "fixed_at" timestamptz,
  "billing_month" text,
  "cost_through" timestamptz NOT NULL,
  "status" "cost_settlement_status" DEFAULT 'pending_rate' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "project_cost_settlements_render_unique" UNIQUE("render_id"),
  CONSTRAINT "project_cost_settlements_cost_check" CHECK (
    "total_cost_usd" >= 0 AND "previous_total_cost_usd" >= 0 AND "incremental_cost_usd" >= 0
  ),
  CONSTRAINT "project_cost_settlements_fixed_fields_check" CHECK (
    ("status" = 'pending_rate' AND "exchange_rate_usd_jpy" IS NULL AND "total_cost_jpy" IS NULL AND "incremental_cost_jpy" IS NULL AND "fixed_at" IS NULL AND "billing_month" IS NULL)
    OR
    ("status" = 'fixed' AND "exchange_rate_usd_jpy" > 0 AND "total_cost_jpy" IS NOT NULL AND "incremental_cost_jpy" IS NOT NULL AND "fixed_at" IS NOT NULL AND "billing_month" ~ '^[0-9]{4}-[0-9]{2}$')
  )
);
CREATE INDEX "project_cost_settlements_project_fixed_idx" ON "project_cost_settlements"("project_id", "fixed_at");
CREATE INDEX "project_cost_settlements_billing_month_idx" ON "project_cost_settlements"("billing_month", "status");

-- Existing completed projects are imported as pending. An administrator explicitly
-- obtains and fixes the live rate after deployment; migrations never invent a rate.
INSERT INTO "project_cost_settlements" (
  "project_id", "render_id", "total_cost_usd", "previous_total_cost_usd",
  "incremental_cost_usd", "cost_through", "status"
)
SELECT latest.project_id, latest.id, costs.total_usd, 0, costs.total_usd, latest.completed_at, 'pending_rate'
FROM (
  SELECT DISTINCT ON (project_id) id, project_id, completed_at
  FROM final_renders
  WHERE status = 'completed' AND completed_at IS NOT NULL
  ORDER BY project_id, completed_at DESC
) latest
CROSS JOIN LATERAL (
  SELECT coalesce(sum(estimated_cost), 0)::numeric(14, 6) AS total_usd
  FROM api_usage
  WHERE project_id = latest.project_id
    AND created_at <= latest.completed_at
    AND operation <> 'video_generation_submit'
) costs
ON CONFLICT (render_id) DO NOTHING;
