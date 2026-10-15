import { z } from "zod";
import type {
  Metal,
  ChartObservation,
  PriceHistory,
  PriceRange,
} from "../shared/types.js";
import { condenseObservations, rangeStart } from "../shared/chart.js";
import { HttpError } from "./errors.js";
import type { SqlPool } from "./sql.js";

const rowsSchema = z
  .array(
    z.object({
      date: z.iso.date(),
      base: z.enum(["XAU", "XAG", "XPT", "XPD"]),
      quote: z.literal("GBP"),
      rate: z.number().positive().max(100000),
    }),
  )
  .min(1)
  .max(25000);
export function parseHistoricalMetal(
  value: unknown,
  fetchedAt: string,
  metal: Metal = "XAU",
): ChartObservation[] {
  const rows = rowsSchema.parse(value);
  const unique = new Map<string, ChartObservation>();
  for (const row of rows) {
    if (row.base !== metal) throw Error("Historical metal mismatch");
    if (row.date > fetchedAt.slice(0, 10))
      throw Error("Historical date is in the future");
    unique.set(row.date, {
      id: "reference-" + row.date,
      source: "frankfurter",
      pricePerOunceGBP: String(row.rate),
      providerAt: row.date + "T00:00:00.000Z",
      fetchedAt,
    });
  }
  return [...unique.values()].sort((a, b) =>
    a.providerAt.localeCompare(b.providerAt),
  );
}

/** Daily institutional reference rates are chart context, never executable quote prices. */
export class HistoricalMetal {
  private cache: { points: ChartObservation[]; fetchedAt: string } | null =
    null;
  private pending: Promise<void> | null = null;
  private retryAfter = 0;
  private warning: string | undefined;
  constructor(
    private pool: SqlPool,
    private clock = Date.now,
    private fetcher: typeof fetch = fetch,
    private metal: Metal = "XAU",
  ) {}

  private async refresh() {
    if (!this.cache) {
      const saved = await this.pool.query(
        "SELECT fetched_at,observations FROM historical_price_cache WHERE source=$1 AND metal=$2",
        ["frankfurter", this.metal],
      );
      if (saved.rows.length)
        this.cache = {
          fetchedAt: new Date(saved.rows[0].fetched_at).toISOString(),
          points: saved.rows[0].observations,
        };
    }
    if (
      this.cache &&
      this.clock() - Date.parse(this.cache.fetchedAt) < 6 * 3600000
    )
      return;
    if (this.clock() < this.retryAfter) return;
    try {
      const fetchedAt = new Date(this.clock()).toISOString();
      const url =
        `https://api.frankfurter.dev/v2/rates?base=${this.metal}&quotes=GBP&from=1999-01-01&to=` +
        fetchedAt.slice(0, 10);
      const response = await this.fetcher(url, {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw Error("Historical provider unavailable");
      const points = parseHistoricalMetal(
        await response.json(),
        fetchedAt,
        this.metal,
      );
      await this.pool.query(
        "INSERT INTO historical_price_cache(source,fetched_at,observations,metal) VALUES($1,$2,$3,$4) ON CONFLICT(source,metal) DO UPDATE SET fetched_at=excluded.fetched_at,observations=excluded.observations",
        ["frankfurter", fetchedAt, JSON.stringify(points), this.metal],
      );
      this.cache = { points, fetchedAt };
      this.warning = undefined;
    } catch {
      this.retryAfter = this.clock() + 60000;
      this.warning =
        "Historical feed unavailable. Showing the last saved reference series.";
    }
  }
  async observations(): Promise<ChartObservation[]> {
    if (!this.pending)
      this.pending = this.refresh().finally(() => {
        this.pending = null;
      });
    await this.pending;
    if (!this.cache) throw new HttpError(503, "Historical prices unavailable");
    return this.cache.points;
  }
  async read(range: PriceRange): Promise<PriceHistory> {
    if (!this.pending)
      this.pending = this.refresh().finally(() => {
        this.pending = null;
      });
    await this.pending;
    if (!this.cache)
      throw new HttpError(
        503,
        "Historical prices are temporarily unavailable. Try Live for the recorded feed.",
      );
    const now = this.clock(),
      from = rangeStart(range, now);
    // Daily reference data is date-based, so include the whole boundary day.
    const boundary = new Date(from).toISOString().slice(0, 10);
    const points = this.cache.points.filter(
      (point) =>
        point.providerAt.slice(0, 10) >= boundary &&
        Date.parse(point.providerAt) <= now,
    );
    const gaps = points
      .slice(1)
      .flatMap((p, i) =>
        Date.parse(p.providerAt) - Date.parse(points[i].providerAt) >
        7 * 86400000
          ? [{ from: points[i].providerAt, to: p.providerAt }]
          : [],
      );
    return {
      points: condenseObservations(points),
      source: "frankfurter",
      from: new Date(from).toISOString(),
      to: new Date(now).toISOString(),
      totalObservations: points.length,
      gaps,
      metadata: {
        kind: "reference",
        availableFrom: this.cache.points[0].providerAt,
        fetchedAt: this.cache.fetchedAt,
        warning: this.warning,
      },
    };
  }
}

// Compatibility for existing gold consumers.
export const parseHistoricalGold = parseHistoricalMetal;
export class HistoricalGold extends HistoricalMetal {}
