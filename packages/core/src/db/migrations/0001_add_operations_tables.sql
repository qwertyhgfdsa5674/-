-- 0001_add_operations_tables.sql
-- Adds operational support tables: trends, event_calendar, listing_tasks,
-- price_history, compliance_checks.
-- Target: PostgreSQL 16+.  All statements use IF NOT EXISTS for idempotency.

-- ── Tables ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trends (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword         varchar(200)  NOT NULL,
  platform        varchar(32)   NOT NULL,
  score           integer       NOT NULL DEFAULT 0,
  source          varchar(64)   NOT NULL DEFAULT 'mock',
  growth_rate     real,
  category        varchar(100),
  first_seen_at   timestamptz   NOT NULL DEFAULT now(),
  last_updated_at timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS trends_keyword_platform_idx
  ON trends (keyword, platform);

CREATE TABLE IF NOT EXISTS event_calendar (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name               varchar(200) NOT NULL,
  event_type         varchar(32)  NOT NULL DEFAULT 'promotion',
  starts_at          timestamptz  NOT NULL,
  ends_at            timestamptz  NOT NULL,
  affected_categories jsonb,
  priority           integer      DEFAULT 0,
  notes              text,
  created_at         timestamptz  DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listing_tasks (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          uuid         NOT NULL,
  target_platform     varchar(32)  NOT NULL,
  status              varchar(32)  NOT NULL DEFAULT 'pending',
  external_listing_id varchar(180),
  error_message       text,
  attempts            integer      DEFAULT 0,
  created_at          timestamptz  DEFAULT now(),
  updated_at          timestamptz  DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_history (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid         NOT NULL,
  cost_cents       integer      NOT NULL,
  list_price_cents integer      NOT NULL,
  changed_at       timestamptz  DEFAULT now(),
  change_reason    varchar(100) DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS compliance_checks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid        NOT NULL,
  check_type  varchar(64) NOT NULL,
  passed      boolean     NOT NULL,
  details     jsonb,
  checked_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trend_history (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword     varchar(200) NOT NULL,
  platform    varchar(32)  NOT NULL,
  source      varchar(64)  NOT NULL,
  score       integer      NOT NULL,
  growth_rate real,
  observed_at timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ab_tests (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid         NOT NULL,
  name              varchar(200) NOT NULL,
  status            varchar(32)  NOT NULL DEFAULT 'draft',
  variants          jsonb        NOT NULL,
  winner_variant_id varchar(120),
  started_at        timestamptz,
  ended_at          timestamptz,
  created_at        timestamptz  DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_alerts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid        NOT NULL,
  sku_id         varchar(180),
  alert_type     varchar(48) NOT NULL,
  severity       varchar(24) NOT NULL DEFAULT 'medium',
  message        text        NOT NULL,
  days_remaining real,
  resolved       boolean     NOT NULL DEFAULT false,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_performance (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id              uuid        NOT NULL,
  promised_ship_hours      integer,
  actual_ship_hours        integer,
  return_rate              real,
  response_hours           real,
  cooperation_count        integer     NOT NULL DEFAULT 0,
  cooperation_amount_cents integer     NOT NULL DEFAULT 0,
  measured_at              timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_alternatives (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid        NOT NULL,
  supplier_id   uuid        NOT NULL,
  priority      integer     NOT NULL DEFAULT 0,
  active        boolean     NOT NULL DEFAULT true,
  switch_reason varchar(200),
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_insights (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid        NOT NULL,
  platform       varchar(32) NOT NULL,
  sentiment      varchar(24) NOT NULL,
  keywords       jsonb       NOT NULL,
  issue_category varchar(80),
  score          real        NOT NULL,
  collected_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_rules (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  platform     varchar(32)  NOT NULL,
  rule_type    varchar(64)  NOT NULL,
  title        varchar(240) NOT NULL,
  content_hash varchar(120) NOT NULL,
  source_url   varchar(1000),
  effective_at timestamptz,
  checked_at   timestamptz  DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exchange_rate_snapshots (
  id             uuid       PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency  varchar(3) NOT NULL,
  quote_currency varchar(3) NOT NULL,
  rate           real       NOT NULL,
  source         varchar(64) NOT NULL,
  observed_at    timestamptz DEFAULT now()
);
