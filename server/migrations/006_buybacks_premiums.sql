ALTER TABLE lots ADD COLUMN default_premium_bps integer NOT NULL DEFAULT 300 CHECK(default_premium_bps BETWEEN 0 AND 2000);
CREATE TABLE buybacks (
 id uuid PRIMARY KEY,
 dealer_id uuid NOT NULL REFERENCES dealers,
 reference text NOT NULL,
 item_name text NOT NULL,
 weight_mg integer NOT NULL CHECK(weight_mg BETWEEN 1 AND 1000000),
 fineness integer NOT NULL CHECK(fineness BETWEEN 1 AND 10000),
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100),
 discount_bps integer NOT NULL CHECK(discount_bps BETWEEN 0 AND 2000),
 price_per_ounce_gbp numeric(16,8) NOT NULL CHECK(price_per_ounce_gbp>0),
 price_source text NOT NULL,
 price_at timestamptz NOT NULL,
 base_pence bigint NOT NULL CHECK(base_pence>0),
 discount_pence bigint NOT NULL CHECK(discount_pence>=0),
 total_pence bigint NOT NULL CHECK(total_pence>0 AND total_pence=base_pence-discount_pence),
 token_hash text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','accepted','received','cancelled')),
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 accepted_at timestamptz,
 accept_request_id uuid,
 closed_at timestamptz,
 completion_request_id uuid,
 completion_payload text,
 lot_id uuid,
 UNIQUE(dealer_id,accept_request_id),
 UNIQUE(dealer_id,completion_request_id),
 FOREIGN KEY(lot_id,dealer_id) REFERENCES lots(id,dealer_id)
);
CREATE INDEX buybacks_dealer_recent ON buybacks(dealer_id,created_at DESC);
CREATE FUNCTION protect_buyback_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','accepted_at','accept_request_id','closed_at','completion_request_id','completion_payload','lot_id']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','accepted_at','accept_request_id','closed_at','completion_request_id','completion_payload','lot_id'])
 THEN RAISE EXCEPTION 'Buy-back snapshots are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER buyback_snapshot_immutable BEFORE UPDATE ON buybacks FOR EACH ROW EXECUTE FUNCTION protect_buyback_snapshot();
