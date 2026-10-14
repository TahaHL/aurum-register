import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { previewDatabase } from "../server/preview-database";
import type { SqlPool } from "../server/sql";
import { DEMO_DEALER_ID, migrate, seed } from "../server/migrate";
import { Ledger } from "../server/ledger";
import { fixtureProvider, PriceFeed } from "../server/prices";
import type { DealerUser } from "../shared/types";
let pool: SqlPool,
  ledger: Ledger,
  feed: PriceFeed,
  now: number,
  cleanup: (() => Promise<void>) | undefined;
const schema = "test_" + randomUUID().replaceAll("-", ""),
  singleLot = "44444444-4444-4444-8444-444444444444";
const quoteInput = {
  lotId: singleLot,
  quantity: 1,
  marginBps: 300,
  reference: "Fictional test customer",
};
const owner: DealerUser = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  dealerId: DEMO_DEALER_ID,
  email: "owner@example.test",
  name: "Test Owner",
  dealerName: "Hadj Lakehal Metals",
  role: "owner",
};
const staff: DealerUser = {
  ...owner,
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  email: "staff@example.test",
  name: "Test Staff",
  role: "staff",
};
const secondOwner: DealerUser = {
  ...owner,
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  dealerId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  dealerName: "Second Dealer",
  email: "other@example.test",
};
function receipt(overrides: Partial<Parameters<Ledger["createLot"]>[0]> = {}) {
  return {
    sku: "AU-TEST-010",
    name: "Test gold bar",
    description: "Fictional incoming stock",
    weightMg: 10000,
    fineness: 9999,
    totalUnits: 3,
    reason: "Received supplier shipment",
    requestId: randomUUID(),
    ...overrides,
  };
}
beforeAll(async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (connectionString) {
    const admin = new pg.Pool({ connectionString });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    const realPool = new pg.Pool({
      connectionString,
      options: `-c search_path=${schema}`,
      max: 12,
    });
    pool = realPool;
    cleanup = async () => {
      await realPool.query(`DROP SCHEMA ${schema} CASCADE`);
      await realPool.end();
    };
  } else {
    const preview = await previewDatabase();
    pool = preview.pool;
    cleanup = preview.close;
  }
  await migrate(pool);
});
beforeEach(async () => {
  await pool.query(
    "TRUNCATE reservations,quotes,ledger_events,lots,stock_movements,users,dealer_sessions CASCADE",
  );
  await seed(pool);
  await pool.query(
    "INSERT INTO dealers(id,name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",
    [secondOwner.dealerId, secondOwner.dealerName],
  );
  for (const user of [owner, staff, secondOwner]) {
    await pool.query(
      "INSERT INTO users(id,dealer_id,email,password_hash,name,role) VALUES($1,$2,$3,$4,$5,$6)",
      [
        user.id,
        user.dealerId,
        user.email,
        "unused-test-password-hash",
        user.name,
        user.role,
      ],
    );
  }
  now = Date.now();
  feed = new PriceFeed(
    fixtureProvider(() => now),
    () => now,
  );
  await feed.refresh();
  ledger = new Ledger(pool, feed, () => now);
});
afterAll(async () => {
  await cleanup?.();
});
it.skipIf(!process.env.TEST_DATABASE_URL)(
  "two independent PostgreSQL transactions cannot reserve the final unit twice",
  async () => {
    const a = await ledger.create(
        { ...quoteInput, reference: "Customer A" },
        owner,
      ),
      b = await ledger.create(
        { ...quoteInput, reference: "Customer B" },
        owner,
      );
    const results = await Promise.allSettled([
      ledger.accept(a.quote.id, a.token, randomUUID()),
      ledger.accept(b.quote.id, b.token, randomUUID()),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((x) => x.status === "rejected")).toHaveLength(1);
    expect(
      (
        await pool.query("SELECT reserved_units FROM lots WHERE id=$1", [
          singleLot,
        ])
      ).rows[0].reserved_units,
    ).toBe(1);
    expect(
      Number(
        (await pool.query("SELECT count(*) FROM reservations")).rows[0].count,
      ),
    ).toBe(1);
  },
);
it("a retried acceptance is idempotent and records one stock movement", async () => {
  const issued = await ledger.create(quoteInput, owner),
    request = randomUUID();
  const a = await ledger.accept(issued.quote.id, issued.token, request),
    b = await ledger.accept(issued.quote.id, issued.token, request);
  expect(a.id).toBe(b.id);
  expect(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM ledger_events WHERE type='stock.reserved'",
        )
      ).rows[0].count,
    ),
  ).toBe(1);
});
it("a changed feed does not reprice an issued quote; snapshots cannot be updated", async () => {
  const issued = await ledger.create(quoteInput, owner);
  await feed.refresh();
  const saved = await ledger.customerQuote(issued.quote.id, issued.token);
  expect(saved.totalPence).toBe(issued.quote.totalPence);
  expect(saved.pricePerOunceGBP).toBe("2100.00000000");
  await expect(
    pool.query(
      "UPDATE quotes SET total_pence=total_pence+1,base_pence=base_pence+1 WHERE id=$1",
      [issued.quote.id],
    ),
  ).rejects.toThrow("immutable");
});
it("expired quotes and invalid customer links cannot reserve inventory", async () => {
  const issued = await ledger.create(quoteInput, owner);
  await expect(
    ledger.accept(issued.quote.id, "a".repeat(64), randomUUID()),
  ).rejects.toThrow("invalid");
  now += 300001;
  await expect(
    ledger.accept(issued.quote.id, issued.token, randomUUID()),
  ).rejects.toThrow("expired");
  expect(
    (await ledger.workspace(owner.dealerId)).lots.find(
      (x) => x.id === singleLot,
    )?.reservedUnits,
  ).toBe(0);
});
it("stale prices cannot issue quotes", async () => {
  now += 120001;
  await expect(ledger.create(quoteInput, owner)).rejects.toThrow("fresh price");
});
it("the expiry worker releases a reservation exactly once", async () => {
  const issued = await ledger.create(quoteInput, owner);
  await ledger.accept(issued.quote.id, issued.token, randomUUID());
  now += 900001;
  expect(await ledger.releaseExpired()).toBe(1);
  expect(await ledger.releaseExpired()).toBe(0);
  expect(
    (await ledger.workspace(owner.dealerId)).lots.find(
      (x) => x.id === singleLot,
    )?.availableUnits,
  ).toBe(1);
});
it("ledger events are append-only", async () => {
  await ledger.create(quoteInput, owner);
  await expect(
    pool.query("UPDATE ledger_events SET type='changed'"),
  ).rejects.toThrow("append-only");
});
it("receiving stock is idempotent and atomically records the staff member and reason", async () => {
  const input = receipt();
  const first = await ledger.createLot(input, staff);
  expect(await ledger.createLot(input, staff)).toEqual(first);
  expect(first.totalUnits).toBe(3);
  const workspace = await ledger.workspace(staff.dealerId);
  expect(workspace.lots.filter((row) => row.sku === input.sku)).toHaveLength(1);
  expect(workspace.events).toHaveLength(1);
  expect(workspace.events[0]).toMatchObject({
    type: "inventory.received",
    details: {
      actorId: staff.id,
      actorName: staff.name,
      reason: input.reason,
      delta: 3,
      before: 0,
      after: 3,
    },
  });
  expect(
    Number(
      (await pool.query("SELECT count(*) FROM stock_movements")).rows[0].count,
    ),
  ).toBe(1);
});
it("a reused inventory key with changed payload fails without changing stock", async () => {
  const input = receipt();
  await ledger.createLot(input, owner);
  await expect(
    ledger.createLot({ ...input, totalUnits: 5 }, owner),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    ledger.createLot({ ...input, requestId: randomUUID() }, owner),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await ledger.workspace(owner.dealerId)).lots.find(
      (row) => row.sku === input.sku,
    )?.totalUnits,
  ).toBe(3);
});
it("stock adjustments cannot remove customer reservations and rejected changes leave no audit rows", async () => {
  const issued = await ledger.create(quoteInput, owner);
  await ledger.accept(issued.quote.id, issued.token, randomUUID());
  await expect(
    ledger.adjustStock(
      singleLot,
      { delta: -1, reason: "Stock count correction", requestId: randomUUID() },
      owner,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await ledger.workspace(owner.dealerId)).lots.find(
      (row) => row.id === singleLot,
    ),
  ).toMatchObject({ totalUnits: 1, reservedUnits: 1 });
  expect(
    Number(
      (await pool.query("SELECT count(*) FROM stock_movements")).rows[0].count,
    ),
  ).toBe(0);
});
it("owner adjustments are idempotent, capped, and audit the exact quantity change", async () => {
  const input = {
    delta: 2,
    reason: "Stock count correction",
    requestId: randomUUID(),
  };
  const first = await ledger.adjustStock(singleLot, input, owner);
  expect(first.totalUnits).toBe(3);
  expect(await ledger.adjustStock(singleLot, input, owner)).toEqual(first);
  await expect(
    ledger.adjustStock(singleLot, { ...input, delta: -1 }, owner),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    ledger.adjustStock(
      singleLot,
      { ...input, delta: 10000, requestId: randomUUID() },
      owner,
    ),
  ).rejects.toMatchObject({ status: 409 });
  const workspace = await ledger.workspace(owner.dealerId);
  expect(workspace.events).toHaveLength(1);
  expect(workspace.events[0]).toMatchObject({
    type: "inventory.adjusted",
    details: { delta: 2, before: 1, after: 3, actorId: owner.id },
  });
  await expect(
    pool.query("UPDATE stock_movements SET reason='rewritten'"),
  ).rejects.toThrow("append-only");
});
it("staff cannot adjust existing stock even through direct domain calls", async () => {
  await expect(
    ledger.adjustStock(
      singleLot,
      { delta: 1, reason: "Stock count correction", requestId: randomUUID() },
      staff,
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    (await ledger.workspace(staff.dealerId)).lots.find(
      (row) => row.id === singleLot,
    )?.totalUnits,
  ).toBe(1);
});
it("dealer isolation covers lists, quote creation, stock changes, and SKU uniqueness", async () => {
  await ledger.create(quoteInput, owner);
  const ownLot = await ledger.createLot(receipt({ sku: "SAME-SKU" }), owner);
  const otherLot = await ledger.createLot(
    receipt({ sku: "SAME-SKU" }),
    secondOwner,
  );
  expect(otherLot.id).not.toBe(ownLot.id);
  const otherWorkspace = await ledger.workspace(secondOwner.dealerId);
  expect(otherWorkspace.lots.map((row) => row.id)).toEqual([otherLot.id]);
  expect(otherWorkspace.quotes).toHaveLength(0);
  expect(otherWorkspace.events).toHaveLength(1);
  await expect(ledger.create(quoteInput, secondOwner)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    ledger.adjustStock(
      singleLot,
      { delta: 1, reason: "Stock count correction", requestId: randomUUID() },
      secondOwner,
    ),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    pool.query("UPDATE lots SET dealer_id=$1 WHERE id=$2", [
      secondOwner.dealerId,
      singleLot,
    ]),
  ).rejects.toMatchObject({ code: "23503" });
});
it("inventory domain rejects fractional quantities, zero adjustments, and invalid reasons", async () => {
  await expect(
    ledger.createLot(receipt({ totalUnits: 1.5 }), owner),
  ).rejects.toThrow();
  await expect(
    ledger.createLot(receipt({ weightMg: 0 }), owner),
  ).rejects.toThrow();
  await expect(
    ledger.createLot(receipt({ reason: "" }), owner),
  ).rejects.toThrow();
  await expect(
    ledger.adjustStock(
      singleLot,
      { delta: 0, reason: "Stock count correction", requestId: randomUUID() },
      owner,
    ),
  ).rejects.toThrow();
});
it.skipIf(!process.env.TEST_DATABASE_URL)(
  "concurrent inventory retries commit one receipt and one audit event",
  async () => {
    const input = receipt();
    const results = await Promise.all([
      ledger.createLot(input, owner),
      ledger.createLot(input, owner),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(
      Number(
        (await pool.query("SELECT count(*) FROM stock_movements")).rows[0]
          .count,
      ),
    ).toBe(1);
    expect(
      Number(
        (await pool.query("SELECT count(*) FROM ledger_events")).rows[0].count,
      ),
    ).toBe(1);
  },
);
it("the dealer migration preserves existing quotes and append-only audit history", async () => {
  const previous = await previewDatabase();
  const legacyLot = randomUUID(),
    legacyQuote = randomUUID(),
    legacyEvent = randomUUID();
  try {
    await previous.pool.query(
      await readFile(
        new URL("../server/migrations/001_foundation.sql", import.meta.url),
        "utf8",
      ),
    );
    await previous.pool.query(
      "CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    await previous.pool.query(
      "INSERT INTO schema_migrations(name) VALUES('001_foundation.sql')",
    );
    await previous.pool.query(
      "INSERT INTO lots(id,sku,name,description,weight_mg,fineness,total_units) VALUES($1,'LEGACY-01','Legacy stock','Preserved demo lot',10000,9999,1)",
      [legacyLot],
    );
    await previous.pool.query(
      `INSERT INTO quotes(id,lot_id,reference,quantity,weight_mg,fineness,price_per_ounce_gbp,price_source,price_at,base_pence,premium_pence,total_pence,margin_bps,token_hash,expires_at)
      VALUES($1,$2,'Legacy customer',1,10000,9999,2100,'fixture',now(),67510,2025,69535,300,$3,now()+interval '5 minutes')`,
      [legacyQuote, legacyLot, "0".repeat(64)],
    );
    await previous.pool.query(
      "INSERT INTO ledger_events(id,type,details) VALUES($1,'quote.created',$2)",
      [legacyEvent, { quoteId: legacyQuote, reference: "Legacy customer" }],
    );
    await migrate(previous.pool);
    expect(
      (
        await previous.pool.query(
          "SELECT dealer_id,total_pence FROM quotes WHERE id=$1",
          [legacyQuote],
        )
      ).rows[0],
    ).toMatchObject({ dealer_id: DEMO_DEALER_ID, total_pence: 69535 });
    expect(
      (
        await previous.pool.query(
          "SELECT dealer_id,details FROM ledger_events WHERE id=$1",
          [legacyEvent],
        )
      ).rows[0],
    ).toEqual({
      dealer_id: DEMO_DEALER_ID,
      details: { quoteId: legacyQuote, reference: "Legacy customer" },
    });
    await expect(
      previous.pool.query("UPDATE quotes SET reference='Changed' WHERE id=$1", [
        legacyQuote,
      ]),
    ).rejects.toThrow("immutable");
    await expect(
      previous.pool.query("DELETE FROM ledger_events WHERE id=$1", [
        legacyEvent,
      ]),
    ).rejects.toThrow("append-only");
  } finally {
    await previous.close();
  }
});

async function heldQuote(input = quoteInput) {
  const issued = await ledger.create(input, owner);
  const held = await ledger.accept(issued.quote.id, issued.token, randomUUID());
  return { issued, held };
}
const outcome = (action: "sold" | "released") => ({
  action,
  reason: "Fictional customer outcome",
  requestId: randomUUID(),
});

it("selling removes only the sold units, preserves other holds and freezes the original price", async () => {
  const lot = await ledger.createLot(receipt({ totalUnits: 4 }), owner);
  const a = await heldQuote({ ...quoteInput, lotId: lot.id, quantity: 2 });
  const b = await heldQuote({ ...quoteInput, lotId: lot.id });
  const input = outcome("sold");
  const sold = await ledger.completeReservation(a.held.id, input, owner);
  expect(sold).toMatchObject({
    status: "sold",
    closedAt: new Date(now).toISOString(),
  });
  expect(await ledger.completeReservation(a.held.id, input, owner)).toEqual(
    sold,
  );
  const workspace = await ledger.workspace(owner.dealerId);
  expect(workspace.lots.find((x) => x.id === lot.id)).toMatchObject({
    totalUnits: 2,
    reservedUnits: 1,
    availableUnits: 1,
  });
  expect(
    (await ledger.customerQuote(b.issued.quote.id, b.issued.token)).reservation
      ?.status,
  ).toBe("held");
  const customer = await ledger.customerQuote(
    a.issued.quote.id,
    a.issued.token,
  );
  expect(customer.totalPence).toBe(a.issued.quote.totalPence);
  expect(customer.dealerName).toBe("Taha Hadj Lakehal");
  expect(customer.reservation?.status).toBe("sold");
  expect(workspace.events.filter((x) => x.type === "stock.sold")).toMatchObject(
    [
      {
        details: {
          actorId: owner.id,
          quantity: 2,
          before: 4,
          after: 2,
          reservedBefore: 3,
          reservedAfter: 1,
          totalPence: a.issued.quote.totalPence,
          reason: input.reason,
        },
      },
    ],
  );
  now += 900001;
  expect(await ledger.releaseExpired()).toBe(1);
  expect(
    (await ledger.workspace(owner.dealerId)).lots.find((x) => x.id === lot.id),
  ).toMatchObject({ totalUnits: 2, reservedUnits: 0 });
});

it("manual release is idempotent, leaves total stock intact and cannot later be sold", async () => {
  const { held } = await heldQuote();
  const input = outcome("released");
  const released = await ledger.completeReservation(held.id, input, owner);
  expect(await ledger.completeReservation(held.id, input, owner)).toEqual(
    released,
  );
  expect(
    (await ledger.workspace(owner.dealerId)).lots.find(
      (x) => x.id === singleLot,
    ),
  ).toMatchObject({ totalUnits: 1, reservedUnits: 0 });
  await expect(
    ledger.completeReservation(held.id, outcome("sold"), owner),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    ledger.completeReservation(
      held.id,
      { ...input, reason: "Changed the note" },
      owner,
    ),
  ).rejects.toMatchObject({ status: 409 });
  now += 900001;
  expect(await ledger.releaseExpired()).toBe(0);
});

it("staff and another dealer cannot close a hold; invalid actions and short reasons are rejected", async () => {
  const { held } = await heldQuote();
  for (const action of ["sold", "released"] as const) {
    await expect(
      ledger.completeReservation(held.id, outcome(action), staff),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      ledger.completeReservation(held.id, outcome(action), secondOwner),
    ).rejects.toMatchObject({ status: 404 });
  }
  await expect(
    ledger.completeReservation(
      held.id,
      { ...outcome("sold"), reason: " " },
      owner,
    ),
  ).rejects.toThrow();
  expect(
    (await ledger.workspace(owner.dealerId)).lots.find(
      (x) => x.id === singleLot,
    ),
  ).toMatchObject({ totalUnits: 1, reservedUnits: 1 });
});

it("an expired hold cannot be sold even before the expiry worker runs", async () => {
  const { held } = await heldQuote();
  now += 900000;
  await expect(
    ledger.completeReservation(held.id, outcome("sold"), owner),
  ).rejects.toMatchObject({ status: 410 });
  expect(
    (await ledger.workspace(owner.dealerId)).events.filter(
      (x) => x.type === "stock.sold",
    ),
  ).toHaveLength(0);
  expect(await ledger.releaseExpired()).toBe(1);
  await expect(
    ledger.completeReservation(held.id, outcome("sold"), owner),
  ).rejects.toMatchObject({ status: 409 });
});

it("failure to write the audit event rolls back the sale and stock change", async () => {
  const { held } = await heldQuote();
  await pool.query(
    "ALTER TABLE ledger_events ADD CONSTRAINT test_reject_sale CHECK(type<>'stock.sold') NOT VALID",
  );
  try {
    await expect(
      ledger.completeReservation(held.id, outcome("sold"), owner),
    ).rejects.toThrow();
    expect(
      (await ledger.workspace(owner.dealerId)).lots.find(
        (x) => x.id === singleLot,
      ),
    ).toMatchObject({ totalUnits: 1, reservedUnits: 1 });
    expect(
      (
        await pool.query(
          "SELECT status,completion_request_id FROM reservations WHERE id=$1",
          [held.id],
        )
      ).rows[0],
    ).toMatchObject({ status: "held", completion_request_id: null });
  } finally {
    await pool.query(
      "ALTER TABLE ledger_events DROP CONSTRAINT test_reject_sale",
    );
  }
});

it("a completion request ID cannot be reused on another hold", async () => {
  const lot = await ledger.createLot(receipt(), owner);
  const a = await heldQuote({ ...quoteInput, lotId: lot.id });
  const b = await heldQuote({ ...quoteInput, lotId: lot.id });
  const input = outcome("sold");
  await ledger.completeReservation(a.held.id, input, owner);
  await expect(
    ledger.completeReservation(b.held.id, input, owner),
  ).rejects.toMatchObject({ code: "23505" });
  expect(
    (await ledger.workspace(owner.dealerId)).lots.find((x) => x.id === lot.id),
  ).toMatchObject({ totalUnits: 2, reservedUnits: 1 });
});

it.skipIf(!process.env.TEST_DATABASE_URL)(
  "concurrent PostgreSQL sale retries produce one sale and one stock deduction",
  async () => {
    const { held } = await heldQuote();
    const input = outcome("sold");
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        ledger.completeReservation(held.id, input, owner),
      ),
    );
    expect(results.every((x) => x.status === "sold")).toBe(true);
    expect(
      (await ledger.workspace(owner.dealerId)).lots.find(
        (x) => x.id === singleLot,
      ),
    ).toMatchObject({ totalUnits: 0, reservedUnits: 0 });
    expect(
      (await ledger.workspace(owner.dealerId)).events.filter(
        (x) => x.type === "stock.sold",
      ),
    ).toHaveLength(1);
  },
);

it.skipIf(!process.env.TEST_DATABASE_URL)(
  "a PostgreSQL sale racing a release has exactly one terminal outcome",
  async () => {
    const { held } = await heldQuote();
    const results = await Promise.allSettled([
      ledger.completeReservation(held.id, outcome("sold"), owner),
      ledger.completeReservation(held.id, outcome("released"), owner),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const final = (
      await pool.query("SELECT status FROM reservations WHERE id=$1", [held.id])
    ).rows[0];
    expect(
      (await ledger.workspace(owner.dealerId)).lots.find(
        (x) => x.id === singleLot,
      ),
    ).toMatchObject({
      totalUnits: final.status === "sold" ? 0 : 1,
      reservedUnits: 0,
    });
  },
);

const buyInput = {
  reference: "Fictional buy-back",
  itemName: "Assessed 18ct scrap",
  weightMg: 20000,
  fineness: 7500,
  quantity: 1,
  discountBps: 300,
};
it("buy-backs preserve an immutable below-spot offer and acceptance never adds inventory", async () => {
  const before = (await ledger.workspace(owner.dealerId)).lots.length;
  const issued = await ledger.buybacks.create(buyInput, staff);
  expect(issued.buyback.totalPence).toBeLessThan(issued.buyback.basePence);
  expect(issued.buyback.discountPence + issued.buyback.totalPence).toBe(
    issued.buyback.basePence,
  );
  const request = randomUUID();
  const accepted = await ledger.buybacks.accept(
    issued.buyback.id,
    issued.token,
    request,
  );
  expect(accepted.status).toBe("accepted");
  expect(
    await ledger.buybacks.accept(issued.buyback.id, issued.token, request),
  ).toEqual(accepted);
  expect((await ledger.workspace(owner.dealerId)).lots).toHaveLength(before);
  await expect(
    pool.query(
      "UPDATE buybacks SET total_pence=total_pence+1,base_pence=base_pence+1 WHERE id=$1",
      [issued.buyback.id],
    ),
  ).rejects.toThrow("immutable");
});
it("verified buy-back receipt adds one lot once and records the original purchase value", async () => {
  const issued = await ledger.buybacks.create(buyInput, owner);
  await ledger.buybacks.accept(issued.buyback.id, issued.token, randomUUID());
  const input = {
    action: "received",
    inspected: true,
    defaultPremiumBps: 600,
    reason: "Assay and weight verified",
    requestId: randomUUID(),
  };
  await expect(
    ledger.buybacks.complete(
      issued.buyback.id,
      { ...input, inspected: false },
      owner,
    ),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    ledger.buybacks.complete(issued.buyback.id, input, staff),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    ledger.buybacks.complete(issued.buyback.id, input, secondOwner),
  ).rejects.toMatchObject({ status: 404 });
  const received = await ledger.buybacks.complete(
    issued.buyback.id,
    input,
    owner,
  );
  expect(
    await ledger.buybacks.complete(issued.buyback.id, input, owner),
  ).toEqual(received);
  expect(
    (await ledger.workspace(owner.dealerId)).lots.find(
      (x) => x.id === received.lotId,
    ),
  ).toMatchObject({
    totalUnits: 1,
    reservedUnits: 0,
    weightMg: 20000,
    fineness: 7500,
    defaultPremiumBps: 600,
  });
  expect(
    (await ledger.workspace(owner.dealerId)).events.filter(
      (x) => x.type === "buyback.received",
    ),
  ).toMatchObject([
    {
      details: {
        actorId: owner.id,
        totalPence: issued.buyback.totalPence,
        reason: input.reason,
      },
    },
  ]);
  await expect(
    ledger.buybacks.complete(
      issued.buyback.id,
      { ...input, reason: "Different note" },
      owner,
    ),
  ).rejects.toMatchObject({ status: 409 });
});
it("expired and cancelled buy-backs cannot be received and invalid customer tokens are rejected", async () => {
  const issued = await ledger.buybacks.create(buyInput, owner);
  await expect(
    ledger.buybacks.customer(issued.buyback.id, "a".repeat(64)),
  ).rejects.toMatchObject({ status: 404 });
  now += 300000;
  await expect(
    ledger.buybacks.accept(issued.buyback.id, issued.token, randomUUID()),
  ).rejects.toMatchObject({ status: 410 });
  expect(
    (await ledger.buybacks.customer(issued.buyback.id, issued.token)).status,
  ).toBe("expired");
  await feed.refresh();
  const next = await ledger.buybacks.create(buyInput, owner);
  await ledger.buybacks.accept(next.buyback.id, next.token, randomUUID());
  now += 900000;
  const input = {
    action: "received",
    inspected: true,
    reason: "Assay verified too late",
    requestId: randomUUID(),
  };
  await expect(
    ledger.buybacks.complete(next.buyback.id, input, owner),
  ).rejects.toMatchObject({ status: 410 });
  const cancelled = await ledger.buybacks.complete(
    next.buyback.id,
    { ...input, action: "cancelled" },
    owner,
  );
  expect(cancelled.status).toBe("cancelled");
  await expect(
    ledger.buybacks.complete(
      next.buyback.id,
      { ...input, requestId: randomUUID() },
      owner,
    ),
  ).rejects.toMatchObject({ status: 409 });
});
it("buy-back audit failure rolls back received stock and allows a safe retry", async () => {
  const issued = await ledger.buybacks.create(buyInput, owner);
  await ledger.buybacks.accept(issued.buyback.id, issued.token, randomUUID());
  const input = {
    action: "received",
    inspected: true,
    reason: "Assay and weight verified",
    requestId: randomUUID(),
  };
  const before = (await ledger.workspace(owner.dealerId)).lots.length;
  await pool.query(
    "ALTER TABLE ledger_events ADD CONSTRAINT test_buyback_failure CHECK(type<>'buyback.received') NOT VALID",
  );
  try {
    await expect(
      ledger.buybacks.complete(issued.buyback.id, input, owner),
    ).rejects.toThrow();
    expect((await ledger.workspace(owner.dealerId)).lots).toHaveLength(before);
    expect(
      (await ledger.buybacks.customer(issued.buyback.id, issued.token)).status,
    ).toBe("accepted");
  } finally {
    await pool.query(
      "ALTER TABLE ledger_events DROP CONSTRAINT test_buyback_failure",
    );
  }
  expect(
    (await ledger.buybacks.complete(issued.buyback.id, input, owner)).status,
  ).toBe("received");
});
it("owner premiums persist without repricing existing quotes; staff and other dealers cannot change them", async () => {
  const issued = await ledger.create(quoteInput, owner);
  const input = {
    defaultPremiumBps: 750,
    reason: "Premium reflects replacement cost",
  };
  await expect(
    ledger.setPremium(singleLot, input, staff),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    ledger.setPremium(singleLot, input, secondOwner),
  ).rejects.toMatchObject({ status: 404 });
  expect(
    (await ledger.setPremium(singleLot, input, owner)).defaultPremiumBps,
  ).toBe(750);
  await ledger.setPremium(singleLot, input, owner);
  expect(
    (await ledger.workspace(owner.dealerId)).events.filter(
      (x) => x.type === "inventory.premium",
    ),
  ).toHaveLength(1);
  expect(
    (await ledger.customerQuote(issued.quote.id, issued.token)).totalPence,
  ).toBe(issued.quote.totalPence);
});
it.skipIf(!process.env.TEST_DATABASE_URL)(
  "concurrent PostgreSQL buy-back receipt retries create one inventory lot",
  async () => {
    const issued = await ledger.buybacks.create(buyInput, owner);
    await ledger.buybacks.accept(issued.buyback.id, issued.token, randomUUID());
    const input = {
      action: "received",
      inspected: true,
      reason: "Assay and weight verified",
      requestId: randomUUID(),
    };
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        ledger.buybacks.complete(issued.buyback.id, input, owner),
      ),
    );
    expect(new Set(results.map((x) => x.lotId)).size).toBe(1);
    expect(
      (await ledger.workspace(owner.dealerId)).events.filter(
        (x) => x.type === "buyback.received",
      ),
    ).toHaveLength(1);
  },
);
