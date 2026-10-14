CREATE TABLE dealers (
 id uuid PRIMARY KEY,
 name text NOT NULL CHECK(length(name) BETWEEN 2 AND 100)
);

INSERT INTO dealers(id,name)
VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Hadj Lakehal Metals');

CREATE TABLE users (
 id uuid PRIMARY KEY,
 dealer_id uuid NOT NULL REFERENCES dealers,
 email text NOT NULL UNIQUE CHECK(email=lower(email)),
 password_hash text NOT NULL,
 name text NOT NULL,
 role text NOT NULL CHECK(role IN ('owner','staff')),
 active boolean NOT NULL DEFAULT true,
 is_demo boolean NOT NULL DEFAULT false,
 UNIQUE(id,dealer_id)
);

CREATE TABLE dealer_sessions (
 sid text PRIMARY KEY,
 data jsonb NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE INDEX dealer_sessions_expiry ON dealer_sessions(expires_at);

-- ADD COLUMN with a constant default backfills the existing demo without
-- UPDATE, preserving the append-only event and immutable quote triggers.
ALTER TABLE lots ADD COLUMN dealer_id uuid NOT NULL DEFAULT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' REFERENCES dealers;
ALTER TABLE quotes ADD COLUMN dealer_id uuid NOT NULL DEFAULT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' REFERENCES dealers;
ALTER TABLE reservations ADD COLUMN dealer_id uuid NOT NULL DEFAULT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' REFERENCES dealers;
ALTER TABLE ledger_events ADD COLUMN dealer_id uuid NOT NULL DEFAULT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' REFERENCES dealers;
ALTER TABLE lots ALTER COLUMN dealer_id DROP DEFAULT;
ALTER TABLE quotes ALTER COLUMN dealer_id DROP DEFAULT;
ALTER TABLE reservations ALTER COLUMN dealer_id DROP DEFAULT;
ALTER TABLE ledger_events ALTER COLUMN dealer_id DROP DEFAULT;

ALTER TABLE lots DROP CONSTRAINT lots_sku_key;
ALTER TABLE lots ADD CONSTRAINT lots_dealer_sku_key UNIQUE(dealer_id,sku);
ALTER TABLE lots ADD CONSTRAINT lots_id_dealer_key UNIQUE(id,dealer_id);
ALTER TABLE lots ADD CONSTRAINT lots_total_units_max CHECK(total_units<=10000);
ALTER TABLE quotes ADD CONSTRAINT quotes_id_dealer_key UNIQUE(id,dealer_id);
ALTER TABLE quotes ADD CONSTRAINT quotes_id_lot_dealer_key UNIQUE(id,lot_id,dealer_id);
ALTER TABLE quotes ADD CONSTRAINT quotes_lot_dealer_fk FOREIGN KEY(lot_id,dealer_id) REFERENCES lots(id,dealer_id);
ALTER TABLE reservations ADD CONSTRAINT reservations_quote_lot_dealer_fk FOREIGN KEY(quote_id,lot_id,dealer_id) REFERENCES quotes(id,lot_id,dealer_id);
ALTER TABLE reservations ADD CONSTRAINT reservations_lot_dealer_fk FOREIGN KEY(lot_id,dealer_id) REFERENCES lots(id,dealer_id);
ALTER TABLE reservations DROP CONSTRAINT reservations_request_id_key;
ALTER TABLE reservations ADD CONSTRAINT reservations_dealer_request_key UNIQUE(dealer_id,request_id);
CREATE INDEX quotes_dealer_recent ON quotes(dealer_id,created_at DESC);
CREATE INDEX events_dealer_recent ON ledger_events(dealer_id,created_at DESC);

CREATE TABLE stock_movements (
 id uuid PRIMARY KEY,
 dealer_id uuid NOT NULL REFERENCES dealers,
 lot_id uuid NOT NULL,
 request_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('received','adjusted')),
 payload_hash text NOT NULL,
 delta integer NOT NULL CHECK(delta<>0),
 before_units integer NOT NULL,
 after_units integer NOT NULL CHECK(after_units BETWEEN 0 AND 10000 AND after_units=before_units+delta),
 reason text NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(dealer_id,request_id),
 FOREIGN KEY(lot_id,dealer_id) REFERENCES lots(id,dealer_id),
 FOREIGN KEY(actor_id,dealer_id) REFERENCES users(id,dealer_id)
);
CREATE INDEX stock_movements_lot_recent ON stock_movements(dealer_id,lot_id,created_at DESC);
CREATE TRIGGER stock_movements_append_only BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION protect_ledger_events();
