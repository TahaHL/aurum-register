import { expect, it } from "vitest";
import { weekendDeskClosed } from "../shared/market-hours";
import { PriceFeed } from "../server/prices";
import { calculateQuote } from "../shared/pricing";
it("desk weekend boundaries use UTC explicitly including clock-change weekends", () => {
  for (const [date, closed] of [
    ["2026-10-23T20:59:59Z", false],
    ["2026-10-23T21:00:00Z", true],
    ["2026-10-24T12:00:00Z", true],
    ["2026-10-25T21:59:59Z", true],
    ["2026-10-25T22:00:00Z", false],
  ] as const)
    expect(weekendDeskClosed(Date.parse(date))).toBe(closed);
});
it("a fresh weekend price stays labelled fresh while issuing new offers is explicitly paused", async () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  const feed = new PriceFeed(
    async () => ({
      id: "weekend",
      source: "public-gold",
      pricePerOunceGBP: "2100",
      providerAt: new Date(now).toISOString(),
      fetchedAt: new Date(now).toISOString(),
    }),
    () => now,
  );
  await feed.refresh();
  expect(feed.state()).toMatchObject({ stale: false, marketClosed: true });
  expect(feed.state().quotePauseReason).toContain("Sunday");
});
it("weekend reopening does not turn an old Friday observation into a usable quote", async () => {
  const feed = new PriceFeed(
    async () => ({
      id: "old",
      source: "public-gold",
      pricePerOunceGBP: "2100",
      providerAt: "2026-10-23T20:59:00Z",
      fetchedAt: "2026-10-25T22:00:00Z",
    }),
    () => Date.parse("2026-10-25T22:00:00Z"),
  );
  await feed.refresh();
  expect(feed.state()).toMatchObject({ marketClosed: false, stale: true });
});
it("a buy-back subtracts the discount and reconciles at the penny boundary", () => {
  expect(
    calculateQuote({
      pricePerOunceGBP: "2100",
      weightMg: 10000,
      fineness: 9999,
      quantity: 1,
      marginBps: 300,
      direction: "buy",
    }),
  ).toEqual({ basePence: 67510, premiumPence: -2025, totalPence: 65485 });
});
