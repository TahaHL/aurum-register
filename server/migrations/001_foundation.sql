CREATE TABLE IF NOT EXISTS lots (
 id uuid PRIMARY KEY, sku text NOT NULL UNIQUE, name text NOT NULL, description text NOT NULL,
 weight_mg integer NOT NULL CHECK(weight_mg BETWEEN 1 AND 1000000), fineness integer NOT NULL CHECK(fineness BETWEEN 1 AND 10000),
 total_units integer NOT NULL CHECK(total_units>=0), reserved_units integer NOT NULL DEFAULT 0 CHECK(reserved_units>=0 AND reserved_units<=total_units), acquired_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quotes (
 id uuid PRIMARY KEY, lot_id uuid NOT NULL REFERENCES lots, reference text NOT NULL,
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100), weight_mg integer NOT NULL, fineness integer NOT NULL,
 price_per_ounce_gbp numeric(16,8) NOT NULL CHECK(price_per_ounce_gbp>0), price_source text NOT NULL, price_at timestamptz NOT NULL,
 base_pence bigint NOT NULL CHECK(base_pence>0), premium_pence bigint NOT NULL CHECK(premium_pence>=0), total_pence bigint NOT NULL CHECK(total_pence=base_pence+premium_pence), margin_bps integer NOT NULL,
 token_hash text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','accepted','expired')),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS reservations (
 id uuid PRIMARY KEY, quote_id uuid NOT NULL UNIQUE REFERENCES quotes, lot_id uuid NOT NULL REFERENCES lots,
 request_id uuid NOT NULL UNIQUE, quantity integer NOT NULL CHECK(quantity>0),
 status text NOT NULL DEFAULT 'held' CHECK(status IN ('held','released')), created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_events (
 id uuid PRIMARY KEY, type text NOT NULL, details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quotes_recent ON quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS reservations_expiry ON reservations(expires_at) WHERE status='held';
CREATE INDEX IF NOT EXISTS events_recent ON ledger_events(created_at DESC);
CREATE OR REPLACE FUNCTION protect_quote_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'Quote snapshots are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER quote_snapshot_immutable BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION protect_quote_snapshot();
CREATE OR REPLACE FUNCTION protect_ledger_events() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Ledger events are append-only'; END $$;
CREATE TRIGGER ledger_append_only BEFORE UPDATE OR DELETE ON ledger_events FOR EACH ROW EXECUTE FUNCTION protect_ledger_events();
