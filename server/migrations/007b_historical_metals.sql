ALTER TABLE historical_price_cache ADD COLUMN metal text NOT NULL DEFAULT 'XAU' CHECK (metal IN ('XAU','XAG','XPT','XPD'));
ALTER TABLE historical_price_cache DROP CONSTRAINT historical_price_cache_pkey;
ALTER TABLE historical_price_cache ADD PRIMARY KEY(source,metal);
