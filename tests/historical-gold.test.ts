import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
import { previewDatabase } from "../server/preview-database";
import { migrate } from "../server/migrate";
import { HistoricalGold, parseHistoricalGold } from "../server/historical-gold";
import { rangeStart } from "../shared/chart";
let db: Awaited<ReturnType<typeof previewDatabase>>;
const initial = Date.UTC(2026, 9, 14, 12);
const rates = [
  { date: "1999-01-06", base: "XAU", quote: "GBP", rate: 169.31 },
  { date: "2016-10-14", base: "XAU", quote: "GBP", rate: 1000 },
  { date: "2024-10-14", base: "XAU", quote: "GBP", rate: 2000 },
  { date: "2026-10-13", base: "XAU", quote: "GBP", rate: 3150 },
];
beforeAll(async () => {
  db = await previewDatabase();
  await migrate(db.pool);
});
beforeEach(async () => {
  await db.pool.query("TRUNCATE historical_price_cache");
});
afterAll(async () => {
  await db.close();
});
it("uses calendar months and clamps leap days rather than fixed approximations", () => {
  expect(new Date(rangeStart("1y", Date.UTC(2024, 1, 29))).toISOString()).toBe(
    "2023-02-28T00:00:00.000Z",
  );
  expect(new Date(rangeStart("3m", Date.UTC(2026, 4, 31))).toISOString()).toBe(
    "2026-02-28T00:00:00.000Z",
  );
  expect(rangeStart("all", initial)).toBe(Date.UTC(1999, 0, 1));
});
it("fetches once for concurrent ranges, filters real dates and reloads the persistent cache", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(JSON.stringify(rates)));
  const service = new HistoricalGold(db.pool, () => initial, fetcher);
  const [all, ten, two, one] = await Promise.all([
    service.read("all"),
    service.read("10y"),
    service.read("2y"),
    service.read("1y"),
  ]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect([
    all.totalObservations,
    ten.totalObservations,
    two.totalObservations,
    one.totalObservations,
  ]).toEqual([4, 3, 2, 1]);
  expect(all.metadata?.availableFrom).toBe("1999-01-06T00:00:00.000Z");
  expect(all.source).toBe("frankfurter");
  const restart = new HistoricalGold(db.pool, () => initial + 3600000, fetcher);
  expect((await restart.read("all")).points).toEqual(all.points);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("retains the saved reference series on failure and backs off retries", async () => {
  let now = initial;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify(rates)))
    .mockRejectedValue(Error("offline"));
  const service = new HistoricalGold(db.pool, () => now, fetcher);
  await service.read("all");
  now += 7 * 3600000;
  const fallback = await service.read("all");
  expect(fallback.totalObservations).toBe(4);
  expect(fallback.metadata?.warning).toContain("last saved");
  await service.read("10y");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("returns an explicit unavailable error if no historical cache exists", async () => {
  const service = new HistoricalGold(
    db.pool,
    () => initial,
    vi.fn<typeof fetch>().mockRejectedValue(Error("offline")),
  );
  await expect(service.read("10y")).rejects.toMatchObject({ status: 503 });
});
it.each([
  [{ date: "2026-10-13", base: "XAU", quote: "USD", rate: 3000 }],
  [{ date: "2026-10-15", base: "XAU", quote: "GBP", rate: 3000 }],
  [{ date: "2026-10-13", base: "XAU", quote: "GBP", rate: -1 }],
])("rejects invalid historical data instead of plotting it", (data) => {
  expect(() =>
    parseHistoricalGold(data, new Date(initial).toISOString()),
  ).toThrow();
});
