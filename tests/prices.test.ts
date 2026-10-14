import { it, expect, vi } from "vitest";
import {
  PriceFeed,
  fixtureProvider,
  publicGoldProvider,
} from "../server/prices";
it("retains the last good snapshot, and becomes stale by provider time", async () => {
  let now = Date.UTC(2026, 9, 13, 12);
  let failed = false;
  const fixture = fixtureProvider(() => now);
  const feed = new PriceFeed(
    async () => {
      if (failed) throw Error("offline");
      return fixture();
    },
    () => now,
  );
  await feed.refresh();
  const first = feed.state().snapshot;
  expect(feed.state().stale).toBe(false);
  failed = true;
  await feed.refresh();
  expect(feed.state().snapshot).toEqual(first);
  expect(feed.state().error).toBeTruthy();
  now += 120001;
  expect(feed.state().stale).toBe(true);
});
it("caches public GBP prices for 30 seconds and retains the provider timestamp", async () => {
  let now = Date.UTC(2026, 9, 14, 12);
  const updatedAt = new Date(now).toISOString();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            symbol: "XAU",
            currency: "GBP",
            price: 3150.123,
            updatedAt,
          }),
        ),
    );
  const provider = publicGoldProvider(() => now, fetcher);
  const first = await provider();
  now += 29999;
  expect(await provider()).toBe(first);
  expect(fetcher).toHaveBeenCalledTimes(1);
  now++;
  expect((await provider()).providerAt).toBe(updatedAt);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(first.source).toBe("public-gold");
  expect(first.pricePerOunceGBP).toBe("3150.123");
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://api.gold-api.com/price/XAU/GBP",
  );
});
it.each([
  { symbol: "XAG", currency: "GBP", price: 3000 },
  { symbol: "XAU", currency: "USD", price: 3000 },
  { symbol: "XAU", currency: "GBP", price: -1 },
])("rejects an invalid provider quote: %j", async (data) => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ ...data, updatedAt: new Date().toISOString() }),
      ),
    );
  await expect(publicGoldProvider(Date.now, fetcher)()).rejects.toThrow();
});
it("rejects provider timestamps ahead of the local clock", async () => {
  const now = Date.UTC(2026, 9, 14, 12);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          symbol: "XAU",
          currency: "GBP",
          price: 3000,
          updatedAt: new Date(now + 61000).toISOString(),
        }),
      ),
    );
  await expect(publicGoldProvider(() => now, fetcher)()).rejects.toThrow(
    "future",
  );
});
it("coalesces concurrent refresh requests into one provider call", async () => {
  let calls = 0;
  const feed = new PriceFeed(async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return fixtureProvider()();
  });
  await Promise.all([feed.refresh(), feed.refresh(), feed.refresh()]);
  expect(calls).toBe(1);
});
