CREATE TABLE historical_price_cache (
 source text PRIMARY KEY,
 fetched_at timestamptz NOT NULL,
 observations jsonb NOT NULL CHECK(jsonb_typeof(observations)='array')
);
