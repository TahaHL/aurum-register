ALTER TABLE price_observations ADD COLUMN metal text NOT NULL DEFAULT 'XAU' CHECK(metal IN ('XAU','XAG','XPT','XPD'));
ALTER TABLE price_observations DROP CONSTRAINT price_observations_source_provider_at_key;
ALTER TABLE price_observations ADD UNIQUE(metal,source,provider_at);
CREATE INDEX price_observations_metal_time ON price_observations(metal,source,provider_at);
