import fs from "node:fs/promises";
import { Decimal } from "decimal.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  priceProduct,
  vatFor,
  buybackPrice,
  validateTiers,
} from "../shared/pricing.js";
import type { Metal } from "../shared/types.js";
import type { SqlPool } from "./sql.js";
import type { MetalMarkets } from "./metals.js";
import { DEMO_DEALER_ID } from "./migrate.js";
import { HttpError } from "./errors.js";

export async function seedCatalogue(pool: SqlPool, markets: MetalMarkets) {
  if (
    Number(
      (
        await pool.query("SELECT count(*) n FROM products WHERE dealer_id=$1", [
          DEMO_DEALER_ID,
        ])
      ).rows[0].n,
    ) >= 110
  )
    return;
  const seed = JSON.parse(
    await fs.readFile(
      new URL("./seed/catalogue.json", import.meta.url),
      "utf8",
    ),
  );
  const histories: Record<string, any[]> = {};
  for (const metal of ["XAU", "XAG", "XPT", "XPD"] as const) {
    try {
      histories[metal] = await markets.histories[metal].referencePoints();
    } catch {
      histories[metal] = [];
    }
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(710308)");
    for (const [index, p] of seed.products.entries()) {
      validateTiers(p.tiers);
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO products(id,dealer_id,sku,slug,name,metal,form,brand,category,design,year,gross_weight_mg_per_unit,fineness,pack_quantity,fine_weight_mg_per_pack,diameter_mm,uk_legal_tender,tags,buyback_discount_bps,sort_order)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) ON CONFLICT(dealer_id,sku) DO NOTHING RETURNING id`,
        [
          id,
          DEMO_DEALER_ID,
          p.sku,
          p.slug,
          p.name,
          p.metal,
          p.form,
          p.brand,
          p.category,
          p.design,
          p.year,
          p.grossWeightMgPerUnit,
          p.fineness,
          p.packQuantity,
          p.fineWeightMgPerPack,
          p.diameterMm,
          p.ukLegalTender,
          p.tags,
          p.buybackDiscountBps,
          index,
        ],
      );
      if (!inserted.rowCount) continue;
      for (const t of p.tiers)
        await client.query("INSERT INTO product_price_tiers VALUES($1,$2,$3)", [
          id,
          t.minQuantity,
          t.premiumBps,
        ]);
      const count = 1 + (index % 3);
      for (let lotIndex = 0; lotIndex < count; lotIndex++) {
        const acquiredAt = new Date(
          Date.now() - (150 - lotIndex * 60) * 86400000,
        );
        const point = histories[p.metal]
          .filter((r) => Date.parse(r.providerAt) <= acquiredAt.getTime())
          .at(-1);
        const unitCost = point
          ? new Decimal(point.pricePerOunceGBP)
              .mul(p.fineWeightMgPerPack)
              .div(31103.4768)
              .mul(
                new Decimal(1).plus(
                  new Decimal(p.tiers[0].premiumBps).mul("0.4").div(10000),
                ),
              )
              .mul(100)
              .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
              .toNumber()
          : null;
        const quantity =
          Math.floor(p.initialStock / count) +
          (lotIndex < p.initialStock % count ? 1 : 0);
        await client.query(
          `INSERT INTO lots(id,dealer_id,sku,name,description,weight_mg,fineness,total_units,default_premium_bps,metal,product_id,source,supplier_reference,unit_cost_pence,acquired_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'supplier',$12,$13,$14)`,
          [
            randomUUID(),
            DEMO_DEALER_ID,
            p.sku + "-OPEN-" + lotIndex,
            p.name,
            "Fictional catalogue stock",
            Math.min(p.grossWeightMgPerUnit, 1000000),
            p.fineness,
            quantity,
            Math.min(p.tiers[0].premiumBps, 2000),
            p.metal,
            id,
            point
              ? "SIMULATED cost based on " +
                point.source +
                " at " +
                point.providerAt
              : "SIMULATED opening stock; historical cost unavailable",
            unitCost,
            acquiredAt,
          ],
        );
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export class Catalogue {
  constructor(
    public pool: SqlPool,
    public markets: MetalMarkets,
  ) {}
  async all(published = true) {
    const { rows } = await this.pool.query(
      `SELECT p.*,COALESCE(s.available,0)::int AS available,COALESCE(s.reserved,0)::int AS reserved,
   (SELECT jsonb_agg(jsonb_build_object('minQuantity',min_quantity,'premiumBps',premium_bps) ORDER BY min_quantity) FROM product_price_tiers WHERE product_id=p.id) AS tiers
   FROM products p LEFT JOIN LATERAL (SELECT sum(total_units-reserved_units) available,sum(reserved_units) reserved FROM lots WHERE product_id=p.id) s ON true
   WHERE p.dealer_id=$1 ${published ? "AND p.published" : ""} ORDER BY p.sort_order`,
      [DEMO_DEALER_ID],
    );
    return rows;
  }
  price(p: any, quantity = 1) {
    const state = this.markets.feeds[p.metal as Metal].state();
    const snapshot = state.snapshot;
    const pricing = snapshot
      ? priceProduct({
          spot: snapshot.pricePerOunceGBP,
          fineWeightMgPerPack: p.fine_weight_mg_per_pack,
          quantity,
          tiers: p.tiers,
        })
      : null;
    const vatPence = pricing ? vatFor(p.metal, pricing.linePence) : null;
    return {
      ...p,
      pricing: pricing
        ? { ...pricing, vatPence, totalPence: pricing.linePence + vatPence! }
        : null,
      buybackPence: snapshot
        ? buybackPrice(
            snapshot.pricePerOunceGBP,
            p.fine_weight_mg_per_pack,
            p.buyback_discount_bps,
          )
        : null,
      priceAt: snapshot?.providerAt,
      source: snapshot?.source,
      spot: snapshot?.pricePerOunceGBP,
      stale: state.stale || !snapshot,
      stockState:
        p.available === 0
          ? "awaiting_stock"
          : p.available <= p.low_stock_threshold
            ? "low_stock"
            : "in_stock",
    };
  }
  async list(query: Record<string, unknown>) {
    const q = z
      .object({
        category: z.string().optional(),
        design: z.string().optional(),
        metal: z.enum(["XAU", "XAG", "XPT", "XPD"]).optional(),
        form: z.enum(["bar", "coin"]).optional(),
        brand: z.string().optional(),
        tag: z.string().optional(),
        weight: z.coerce.number().positive().optional(),
        inStock: z.enum(["true", "false"]).optional(),
        sort: z
          .enum(["featured", "newest", "price_asc", "price_desc"])
          .default("featured"),
        page: z.coerce.number().int().min(1).max(10000).default(1),
        pageSize: z.coerce
          .number()
          .refine((x) => [24, 48, 100].includes(x))
          .default(24),
        qty: z.coerce.number().int().min(1).max(1000).default(1),
      })
      .parse(query);
    const all = await this.all();
    const facets: Record<string, Record<string, number>> = {
      brand: {},
      category: {},
      metal: {},
      form: {},
      weight: {},
    };
    for (const p of all)
      for (const key of Object.keys(facets))
        facets[key][key === "weight" ? p.fine_weight_mg_per_pack : p[key]] =
          (facets[key][key === "weight" ? p.fine_weight_mg_per_pack : p[key]] ||
            0) + 1;
    let rows = all
      .filter(
        (p) =>
          (!q.category || p.category === q.category) &&
          (!q.design || p.design === q.design) &&
          (!q.metal || p.metal === q.metal) &&
          (!q.form || p.form === q.form) &&
          (!q.brand || p.brand === q.brand) &&
          (!q.tag || p.tags.includes(q.tag)) &&
          (!q.weight || p.fine_weight_mg_per_pack === q.weight) &&
          (!q.inStock || q.inStock === "false" || p.available > 0),
      )
      .map((p) => this.price(p, q.qty));
    if (q.sort === "newest") rows.sort((a, b) => (b.year || 0) - (a.year || 0));
    if (q.sort.startsWith("price_"))
      rows.sort(
        (a, b) =>
          ((a.pricing?.totalPence ?? Infinity) -
            (b.pricing?.totalPence ?? Infinity)) *
          (q.sort === "price_asc" ? 1 : -1),
      );
    return {
      items: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
      total: rows.length,
      page: q.page,
      pageSize: q.pageSize,
      facets,
    };
  }
  async product(slug: string, quantity = 1) {
    const all = await this.all(),
      p = all.find((x) => x.slug === slug);
    if (!p) throw new HttpError(404, "Product not found");
    return {
      ...this.price(p, quantity),
      pricedTiers: p.tiers.map(
        (t: any) => this.price(p, t.minQuantity).pricing,
      ),
      related: all
        .filter((x) => x.category === p.category && x.id !== p.id)
        .slice(0, 4)
        .map((x) => this.price(x)),
    };
  }
}
