import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { previewDatabase } from "../server/preview-database";
import { migrate } from "../server/migrate";
import { PriceHistoryStore } from "../server/price-history";
let db: Awaited<ReturnType<typeof previewDatabase>>;
beforeAll(async () => {
  db = await previewDatabase();
  await migrate(db.pool);
});
beforeEach(async () => {
  await db.pool.query("TRUNCATE price_observations");
});
afterAll(async () => {
  await db.close();
});
const add = async (history: PriceHistoryStore, at: string, value: string) =>
  history.append({
    id: randomUUID(),
    source: "fixture",
    pricePerOunceGBP: value,
    providerAt: at,
    fetchedAt: at,
  });
it("uses London midnight in BST and separates metal and source", async () => {
  const now = Date.parse("2026-07-01T23:30:00Z");
  const silver = new PriceHistoryStore(db.pool, "fixture", () => now, "XAG");
  const gold = new PriceHistoryStore(db.pool, "fixture", () => now, "XAU");
  await add(silver, "2026-07-01T22:59:00Z", "20");
  await add(silver, "2026-07-01T23:00:00Z", "30");
  await add(silver, "2026-07-01T23:20:00Z", "31");
  await add(gold, "2026-07-01T23:00:00Z", "2000");
  const summary = await silver.summary();
  expect(summary.dayOpen?.pricePerOunceGBP).toBe("30.0000000000");
  expect(summary.dayOpen?.providerAt).toBe("2026-07-01T23:00:00.000Z");
  expect(summary.firstObservedAt).toBe("2026-07-01T22:59:00.000Z");
});
it("returns null with no observations today, and handles winter GMT", async () => {
  const history = new PriceHistoryStore(
    db.pool,
    "fixture",
    () => Date.parse("2026-12-02T00:30:00Z"),
    "XAG",
  );
  expect(await history.summary()).toEqual({
    dayOpen: null,
    firstObservedAt: null,
  });
  await add(history, "2026-12-01T23:30:00Z", "20");
  expect((await history.summary()).dayOpen).toBeNull();
  await add(history, "2026-12-02T00:01:00Z", "21");
  expect((await history.summary()).dayOpen?.pricePerOunceGBP).toBe(
    "21.0000000000",
  );
});
