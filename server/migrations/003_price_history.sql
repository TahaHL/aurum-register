CREATE TABLE price_observations (
 id uuid PRIMARY KEY,
 source text NOT NULL CHECK(source IN ('fixture','goldapi','public-gold')),
 price_gbp numeric(20,10) NOT NULL CHECK(price_gbp>0),
 provider_at timestamptz NOT NULL,
 fetched_at timestamptz NOT NULL,
 UNIQUE(source,provider_at)
);
CREATE INDEX price_observations_source_time ON price_observations(source,provider_at);
