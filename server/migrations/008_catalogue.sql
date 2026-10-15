
CREATE TABLE products (
 id uuid PRIMARY KEY, dealer_id uuid NOT NULL REFERENCES dealers(id), sku text NOT NULL,
 slug text NOT NULL, name text NOT NULL, metal text NOT NULL CHECK(metal IN ('XAU','XAG','XPT','XPD')),
 form text NOT NULL CHECK(form IN ('bar','coin')), brand text NOT NULL, category text NOT NULL,
 design text, year integer, gross_weight_mg_per_unit integer NOT NULL CHECK(gross_weight_mg_per_unit>0),
 fineness integer NOT NULL CHECK(fineness BETWEEN 1 AND 10000), pack_quantity integer NOT NULL CHECK(pack_quantity>0),
 fine_weight_mg_per_pack integer NOT NULL CHECK(fine_weight_mg_per_pack>0), diameter_mm numeric,
 uk_legal_tender boolean NOT NULL DEFAULT false, tags text[] NOT NULL DEFAULT '{}',
 buyback_discount_bps integer NOT NULL CHECK(buyback_discount_bps BETWEEN 0 AND 10000),
 low_stock_threshold integer NOT NULL DEFAULT 5 CHECK(low_stock_threshold>=0), published boolean NOT NULL DEFAULT true,
 sort_order integer NOT NULL DEFAULT 0, UNIQUE(dealer_id,slug), UNIQUE(dealer_id,sku)
);
CREATE TABLE product_price_tiers(product_id uuid NOT NULL REFERENCES products(id),min_quantity integer NOT NULL CHECK(min_quantity BETWEEN 1 AND 1000),premium_bps integer NOT NULL CHECK(premium_bps BETWEEN 0 AND 10000),PRIMARY KEY(product_id,min_quantity));
ALTER TABLE lots ADD COLUMN metal text NOT NULL DEFAULT 'XAU' CHECK(metal IN ('XAU','XAG','XPT','XPD'));
ALTER TABLE lots ADD COLUMN product_id uuid REFERENCES products(id);
ALTER TABLE lots ADD COLUMN unit_cost_pence bigint CHECK(unit_cost_pence>=0);
ALTER TABLE lots ADD COLUMN source text NOT NULL DEFAULT 'adjustment' CHECK(source IN ('supplier','buyback','adjustment'));
ALTER TABLE lots ADD COLUMN supplier_reference text;
CREATE INDEX lots_product_fifo ON lots(product_id,acquired_at,id);
