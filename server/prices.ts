import { weekendDeskClosed, WEEKEND_NOTICE } from "../shared/market-hours.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PriceSnapshot, PriceState, Metal } from "../shared/types.js";
export type PriceProvider = () => Promise<PriceSnapshot>;
export function publicGoldProvider(
  clock = Date.now,
  fetcher: typeof fetch = fetch,
  metal: Metal = "XAU",
): PriceProvider {
  let cached: PriceSnapshot | null = null;
  return async () => {
    if (cached && clock() - Date.parse(cached.fetchedAt) < 30000) return cached;
    const response = await fetcher(`https://api.gold-api.com/price/${metal}/GBP`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw Error("Gold price provider is unavailable");
    const data = z
      .object({
        symbol: z.literal(metal),
        currency: z.literal("GBP"),
        price: z.number().positive().max(100000),
        updatedAt: z.iso.datetime(),
      })
      .parse(await response.json());
    if (Date.parse(data.updatedAt) > clock() + 60000)
      throw Error("Provider timestamp is in the future");
    cached = {
      id: randomUUID(),
      source: "public-gold",
      pricePerOunceGBP: String(data.price),
      providerAt: data.updatedAt,
      fetchedAt: new Date(clock()).toISOString(),
    };
    return cached;
  };
}
export function fixtureProvider(clock = Date.now, metal: Metal = "XAU"): PriceProvider {
  let tick = 0;
  const values = { XAU: ["2100.00", "2105.50", "2097.25", "2102.75"], XAG: ["30", "30.1", "29.9", "30.2"], XPT: ["1000", "1001", "999", "1002"], XPD: ["800", "801", "799", "802"] }[metal];
  return async () => ({
    id: randomUUID(),
    pricePerOunceGBP: values[tick++ % values.length],
    source: "fixture",
    providerAt: new Date(clock()).toISOString(),
    fetchedAt: new Date(clock()).toISOString(),
  });
}
export function goldApiProvider(key: string, clock = Date.now): PriceProvider {
  return async () => {
    if (!key) throw Error("GoldAPI key is not configured");
    const response = await fetch(
      "https://www.goldapi.io/api/price/XAU/GBP?melt_price=false&currency_info=false",
      { headers: { "x-access-token": key }, signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) throw Error("GoldAPI did not return a usable price");
    const data = z
      .object({
        metal: z.literal("XAU"),
        currency: z.literal("GBP"),
        price: z.number().positive().max(100000),
        timestamp: z.number().positive(),
      })
      .parse(await response.json());
    const providerAt = new Date(data.timestamp * 1000).toISOString();
    if (data.timestamp * 1000 > clock() + 60000)
      throw Error("Provider timestamp is in the future");
    return {
      id: randomUUID(),
      source: "goldapi",
      pricePerOunceGBP: String(data.price),
      providerAt,
      fetchedAt: new Date(clock()).toISOString(),
    };
  };
}
export class PriceFeed {
  private snapshot: PriceSnapshot | null = null;
  private error: string | null = null;
  private pending: Promise<void> | null = null;
  constructor(
    private provider: PriceProvider,
    private clock = Date.now,
    private maxAge = 120000,
    private record: (snapshot: PriceSnapshot) => Promise<void> = async () => {},
  ) {}
  state(): PriceState {
    const marketClosed =
      this.snapshot?.source !== "fixture" && weekendDeskClosed(this.clock());
    return {
      marketClosed,
      quotePauseReason: marketClosed ? WEEKEND_NOTICE : null,
      snapshot: this.snapshot,
      stale:
        !this.snapshot ||
        this.clock() - Date.parse(this.snapshot.providerAt) > this.maxAge,
      error: this.error,
      maxAgeSeconds: this.maxAge / 1000,
    };
  }
  refresh(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      try {
        const next = await this.provider();
        await this.record(next);
        this.snapshot = next;
        this.error = null;
      } catch {
        this.error =
          "Price feed unavailable. The last snapshot is retained; stale prices cannot create quotes.";
      } finally {
        this.pending = null;
      }
    })();
    return this.pending;
  }
}
