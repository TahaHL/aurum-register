import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { previewDatabase } from "../server/preview-database";
import { migrate, seed, DEMO_DEALER_ID } from "../server/migrate";
import { PriceFeed, fixtureProvider } from "../server/prices";
import { PriceHistoryStore } from "../server/price-history";
import { MetalMarkets } from "../server/metals";
import { Catalogue, seedCatalogue } from "../server/catalogue";
import { Shop } from "../server/shop";
import { storeReport } from "../server/store-admin";
import {
  priceProduct,
  vatFor,
  validateTiers,
  buybackPrice,
} from "../shared/pricing";
import type { SqlPool } from "../server/sql";
import type { DealerUser } from "../shared/types";
let pool: SqlPool,
  close: () => Promise<void>,
  catalogue: Catalogue,
  shop: Shop,
  now = Date.now();
const owner: DealerUser = {
  id: randomUUID(),
  dealerId: DEMO_DEALER_ID,
  name: "Owner",
  dealerName: "Demo",
  email: "owner@example.invalid",
  role: "owner",
};
beforeAll(async () => {
  if (process.env.TEST_DATABASE_URL) {
    const schema = "store_" + randomUUID().replaceAll("-", ""),
      admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const native = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 25,
    });
    pool = native;
    close = async () => {
      await native.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    };
  } else {
    const db = await previewDatabase();
    pool = db.pool;
    close = db.close;
  }
  await migrate(pool);
  await seed(pool);
  const history = new PriceHistoryStore(pool, "fixture");
  const feed = new PriceFeed(fixtureProvider());
  const markets = new MetalMarkets(pool, feed, history, true);
  await markets.refresh();
  catalogue = new Catalogue(pool, markets);
  await seedCatalogue(pool, markets);
  shop = new Shop(catalogue, () => now);
}, 60000);
afterAll(async () => {
  await close?.();
});
const tiers = [
  { minQuantity: 1, premiumBps: 500 },
  { minQuantity: 2, premiumBps: 470 },
  { minQuantity: 5, premiumBps: 440 },
  { minQuantity: 10, premiumBps: 400 },
  { minQuantity: 25, premiumBps: 360 },
  { minQuantity: 100, premiumBps: 320 },
];
it.each([1, 2, 4, 5, 9, 10, 24, 25, 99, 100, 500])(
  "prices tier boundary %i with reconciling pennies",
  (quantity) => {
    const p = priceProduct({
      spot: "30",
      fineWeightMgPerPack: 31103,
      quantity,
      tiers,
    });
    expect(p.tier).toEqual(
      tiers.filter((t) => t.minQuantity <= quantity).at(-1),
    );
    expect(p.basePence + p.premiumPence).toBe(p.linePence);
    expect(p.unitPence * quantity).toBe(p.linePence);
  },
);
it("rejects invalid tiers and models VAT and buy-back separately", () => {
  expect(() => validateTiers([{ minQuantity: 2, premiumBps: 200 }])).toThrow();
  expect(() =>
    validateTiers([
      { minQuantity: 1, premiumBps: 200 },
      { minQuantity: 5, premiumBps: 300 },
    ]),
  ).toThrow();
  expect(vatFor("XAU", 12345)).toBe(0);
  for (const m of ["XAG", "XPT", "XPD"] as const)
    expect(vatFor(m, 12345)).toBe(2469);
  expect(vatFor("XAG", 3)).toBe(1);
  expect(buybackPrice("100", 31103, 100)).toBe(9900);
});
it("seeds 110 products idempotently and filters/pages server prices", async () => {
  await seedCatalogue(pool, catalogue.markets);
  expect((await catalogue.all()).length).toBe(110);
  const silver = await catalogue.list({ metal: "XAG", pageSize: 24 });
  expect(silver.total).toBe(27);
  expect(silver.items).toHaveLength(24);
  expect(silver.items.every((p) => p.spot === "30")).toBe(true);
  expect((await catalogue.list({ metal: "XAG", page: 2 })).items).toHaveLength(
    3,
  );
  const p = silver.items[0];
  await pool.query("UPDATE products SET published=false WHERE id=$1", [p.id]);
  await expect(catalogue.product(p.slug)).rejects.toMatchObject({
    status: 404,
  });
  await pool.query("UPDATE products SET published=true WHERE id=$1", [p.id]);
});
async function basket(productId: string, quantity = 1) {
  const id = randomUUID(),
    sid = randomUUID();
  await pool.query(
    "INSERT INTO customers(id,name,email,password_hash) VALUES($1,$2,$3,$4)",
    [id, "Fictional test", id + "@example.invalid", "not-a-login"],
  );
  await pool.query("INSERT INTO basket_lines VALUES($1,$2,$3)", [
    sid,
    productId,
    quantity,
  ]);
  return { id, sid, lock: await shop.lock(sid, id) };
}
it("checkout is retry-safe, snapshots stay immutable, and cancellation restores original lots once", async () => {
  const p = (await catalogue.all())[0],
    before = (
      await pool.query("SELECT * FROM lots WHERE product_id=$1", [p.id])
    ).rows[0];
  const b = await basket(p.id, 2);
  const first = await shop.place(b.id, b.lock.id, b.lock.requestId),
    second = await shop.place(b.id, b.lock.id, b.lock.requestId);
  expect(second.id).toBe(first.id);
  expect(
    (await pool.query("SELECT total_units FROM lots WHERE id=$1", [before.id]))
      .rows[0].total_units,
  ).toBe(before.total_units - 2);
  await expect(
    pool.query("UPDATE checkout_locks SET total_pence=1 WHERE id=$1", [
      b.lock.id,
    ]),
  ).rejects.toThrow();
  await expect(
    shop.transition(first.id, "cancelled", { ...owner, role: "staff" }),
  ).rejects.toMatchObject({ status: 403 });
  await shop.transition(first.id, "cancelled", owner);
  await shop.transition(first.id, "cancelled", owner);
  expect(
    (await pool.query("SELECT total_units FROM lots WHERE id=$1", [before.id]))
      .rows[0].total_units,
  ).toBe(before.total_units);
});
it("expired lock refuses an order until refreshed", async () => {
  const p = (await catalogue.all())[1],
    b = await basket(p.id);
  now += 600001;
  await expect(
    shop.place(b.id, b.lock.id, b.lock.requestId),
  ).rejects.toMatchObject({ status: 409 });
  now = Date.now();
});
it("FIFO allocations span lots and exclude reserved units; P&L reconciles", async () => {
  const p = (await catalogue.all())[2];
  await pool.query(
    "UPDATE lots SET total_units=0,reserved_units=0 WHERE product_id=$1",
    [p.id],
  );
  const old = (
      await pool.query("SELECT id FROM lots WHERE product_id=$1", [p.id])
    ).rows[0].id,
    newId = randomUUID();
  await pool.query(
    "UPDATE lots SET total_units=2,reserved_units=1,unit_cost_pence=1000,acquired_at=now()-interval '10 days' WHERE id=$1",
    [old],
  );
  await pool.query(
    `INSERT INTO lots(id,dealer_id,sku,name,description,weight_mg,fineness,total_units,metal,product_id,unit_cost_pence,acquired_at) VALUES($1,$2,$3,'Test lot','Fictional',1000,9999,2,'XAU',$4,2000,now())`,
    [newId, DEMO_DEALER_ID, newId, p.id],
  );
  const b = await basket(p.id, 2),
    o = await shop.place(b.id, b.lock.id, b.lock.requestId);
  const a = (
    await pool.query(
      "SELECT a.* FROM order_allocations a JOIN order_lines l ON l.id=a.order_line_id WHERE l.order_id=$1",
      [o.id],
    )
  ).rows;
  expect(a).toHaveLength(2);
  expect(a.find((x) => x.lot_id === old)?.quantity).toBe(1);
  expect(a.find((x) => x.lot_id === newId)?.quantity).toBe(1);
  const r = await storeReport(
    catalogue,
    new Date(Date.now() - 86400000).toISOString(),
    new Date(Date.now() + 86400000).toISOString(),
  );
  expect(r.summary.cogsPence).toBe(3000);
  expect(r.summary.grossProfitPence).toBe(r.summary.revenuePence - 3000);
  expect(r.summary.revenuePence + r.summary.vatPence).toBe(b.lock.totalPence);
});
it.skipIf(!process.env.TEST_DATABASE_URL)(
  "native PostgreSQL: twenty customers competing for one unit produce exactly one order",
  async () => {
    const p = (await catalogue.all())[3];
    await pool.query(
      "UPDATE lots SET total_units=1,reserved_units=0 WHERE product_id=$1",
      [p.id],
    );
    const buyers = await Promise.all(
      Array.from({ length: 20 }, () => basket(p.id)),
    );
    const results = await Promise.allSettled(
      buyers.map((b) => shop.place(b.id, b.lock.id, b.lock.requestId)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (
        await pool.query(
          "SELECT sum(total_units)::int n FROM lots WHERE product_id=$1",
          [p.id],
        )
      ).rows[0].n,
    ).toBe(0);
  },
);
