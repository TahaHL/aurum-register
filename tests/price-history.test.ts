import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { previewDatabase } from "../server/preview-database";
import { migrate } from "../server/migrate";
import { PriceHistoryStore } from "../server/price-history";
import type { PriceSnapshot } from "../shared/types";
let database: Awaited<ReturnType<typeof previewDatabase>>;
const now = Date.UTC(2026, 9, 14, 12);
let history: PriceHistoryStore;
const point = (
  age: number,
  source: PriceSnapshot["source"] = "public-gold",
): PriceSnapshot => ({
  id: randomUUID(),
  source,
  pricePerOunceGBP: "3150.123456789",
  providerAt: new Date(now - age).toISOString(),
  fetchedAt: new Date(now).toISOString(),
});
beforeAll(async () => {
  database = await previewDatabase();
  await migrate(database.pool);
  history = new PriceHistoryStore(database.pool, "public-gold", () => now);
});
beforeEach(async () => {
  await database.pool.query("TRUNCATE price_observations");
});
afterAll(async () => {
  await database?.close();
});
it("deduplicates provider timestamps, separates simulated prices and applies time ranges", async () => {
  const first = point(90000);
  await history.append(first);
  await history.append({ ...first, id: randomUUID() });
  await history.append(point(30000));
  await history.append(point(30000, "fixture"));
  await history.append(point(7200000));
  const result = await history.read("1h");
  expect(result.totalObservations).toBe(2);
  expect(result.points[0].providerAt).toBe(first.providerAt);
  expect(result.points[0].pricePerOunceGBP).toBe("3150.1234567890");
  expect((await history.read("6h")).totalObservations).toBe(3);
});
it("records missing-data gaps and removes prices older than the retention window", async () => {
  await history.append(point(300000));
  await history.append(point(30000));
  await history.append(point(8 * 86400000));
  const result = await history.read("1h");
  expect(result.gaps).toEqual([
    { from: point(300000).providerAt, to: point(30000).providerAt },
  ]);
  await history.prune();
  expect(
    Number(
      (await database.pool.query("SELECT count(*) FROM price_observations"))
        .rows[0].count,
    ),
  ).toBe(2);
});

it("keeps simultaneous metal observations isolated and never uses gold history for silver", async () => {
  const silver = new PriceHistoryStore(
    database.pool,
    "public-gold",
    () => now,
    "XAG",
  );
  const goldPoint = point(30000);
  await history.append(goldPoint);
  await silver.append({
    ...goldPoint,
    id: randomUUID(),
    pricePerOunceGBP: "42",
  });
  expect((await history.read("1d")).points[0].pricePerOunceGBP).toBe(
    "3150.1234567890",
  );
  const all = await silver.read("1d");
  expect(all.points).toHaveLength(1);
  expect(all.points[0].pricePerOunceGBP).toBe("42.0000000000");
  expect(all.metadata?.kind).toBe("observed");
  expect(all.metadata?.warning).toContain("Intraday observations");
});
