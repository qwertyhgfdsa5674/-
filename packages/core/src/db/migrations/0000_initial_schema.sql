-- 0000_initial_schema.sql
-- Hand-written initial migration establishing the core e-commerce schema.
-- Target: PostgreSQL 16+.  All statements use IF NOT EXISTS for idempotency.

-- ── Enums ──────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE product_status AS ENUM ('draft', 'active', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'pending', 'paid', 'fulfilled', 'cancelled', 'refunded'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Tables ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  title       varchar(240)  NOT NULL,
  description varchar(2000),
  status      product_status NOT NULL DEFAULT 'draft',
  source_url  varchar(1000),
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name              varchar(180) NOT NULL,
  platform          varchar(32)  NOT NULL,
  external_id       varchar(180),
  reliability_score integer      NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  platform          varchar(32)  NOT NULL,
  external_order_id varchar(180) NOT NULL,
  product_id        uuid         NOT NULL,
  quantity          integer      NOT NULL,
  status            order_status NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS pricing (
  product_id       uuid        PRIMARY KEY,
  cost_cents       integer     NOT NULL,
  list_price_cents integer     NOT NULL,
  currency         varchar(3)  NOT NULL DEFAULT 'CNY'
);
