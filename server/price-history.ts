import type { SqlPool } from "./sql.js";
import type {
  Metal,
  PriceHistory,
  PriceRange,
  PriceSnapshot,
} from "../shared/types.js";
import { condenseObservations, RANGE_MS, rangeStart } from "../shared/chart.js";
import { HistoricalMetal } from "./historical-gold.js";
export class PriceHistoryStore {
  private historical: HistoricalMetal;
  constructor(
    private pool: SqlPool,
    private source: PriceSnapshot["source"],
    private clock = Date.now,
    private metal: Metal = "XAU",
  ) {
    this.historical = new HistoricalMetal(pool, clock, fetch, metal);
  }
  async append(snapshot: PriceSnapshot) {
    await this.pool.query(
      "INSERT INTO price_observations(id,source,price_gbp,provider_at,fetched_at,metal) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(metal,source,provider_at) DO NOTHING",
      [
        snapshot.id,
        snapshot.source,
        snapshot.pricePerOunceGBP,
        snapshot.providerAt,
        snapshot.fetchedAt,
        this.metal,
      ],
    );
  }
  async summary() {
    // PostgreSQL AT TIME ZONE handles both GMT and BST, including transition dates.
    const result = await this.pool.query(
      `SELECT
        (SELECT min(provider_at) FROM price_observations WHERE source=$1 AND metal=$2 AND provider_at<=$3) AS first_at,
        (SELECT price_gbp FROM price_observations WHERE source=$1 AND metal=$2 AND provider_at >= (date_trunc('day', $3::timestamptz AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London') AND provider_at<=$3 ORDER BY provider_at LIMIT 1) AS open_price,
        (SELECT provider_at FROM price_observations WHERE source=$1 AND metal=$2 AND provider_at >= (date_trunc('day', $3::timestamptz AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London') AND provider_at<=$3 ORDER BY provider_at LIMIT 1) AS open_at`,
      [this.source, this.metal, new Date(this.clock())],
    );
    const row = result.rows[0];
    return {
      dayOpen: row.open_at
        ? {
            pricePerOunceGBP: String(row.open_price),
            providerAt: new Date(row.open_at).toISOString(),
          }
        : null,
      firstObservedAt: row.first_at
        ? new Date(row.first_at).toISOString()
        : null,
    };
  }
  async read(range: PriceRange): Promise<PriceHistory> {
    if (!["1h", "6h", "1d"].includes(range))
      return this.source === "fixture"
        ? fixtureHistory(this.metal, range, this.clock())
        : this.historical.read(range);
    const to = new Date(this.clock()),
      from = new Date(rangeStart(range, to.getTime()));
    const result = await this.pool.query(
      "SELECT * FROM price_observations WHERE source=$1 AND metal=$4 AND provider_at>=$2 AND provider_at<=$3 ORDER BY provider_at DESC LIMIT 21000",
      [this.source, from, to, this.metal],
    );
    const points: PriceSnapshot[] = result.rows.reverse().map((row) => ({
      id: row.id,
      source: row.source,
      pricePerOunceGBP: String(row.price_gbp),
      providerAt: new Date(row.provider_at).toISOString(),
      fetchedAt: new Date(row.fetched_at).toISOString(),
    }));
    const gaps = points
      .slice(1)
      .flatMap((point, index) =>
        Date.parse(point.providerAt) - Date.parse(points[index].providerAt) >
        120000
          ? [{ from: points[index].providerAt, to: point.providerAt }]
          : [],
      );
    return {
      points: condenseObservations(points),
      source: this.source,
      from: from.toISOString(),
      to: to.toISOString(),
      totalObservations: points.length,
      gaps,
      metadata: {
        kind: "observed",
        availableFrom: points[0]?.providerAt || to.toISOString(),
        fetchedAt: to.toISOString(),
        warning:
          this.metal !== "XAU"
            ? "Intraday observations start when collection begins and are retained for seven days."
            : undefined,
      },
    };
  }
  async referencePoints() {
    return this.source === "fixture"
      ? fixtureHistory(this.metal, "all", this.clock(), false).points
      : this.historical.observations();
  }
  async prune() {
    await this.pool.query(
      "DELETE FROM price_observations WHERE provider_at<$1",
      [new Date(this.clock() - RANGE_MS["7d"])],
    );
  }
}

// Deterministic test/demo data only. Never represented as actual market history.
function fixtureHistory(
  metal: Metal,
  range: PriceRange,
  now: number,
  condense = true,
): PriceHistory {
  const from = rangeStart(range, now),
    start = Date.UTC(1999, 0, 1);
  const base = { XAU: 3150, XAG: 38, XPT: 1100, XPD: 950 }[metal];
  const points = [];
  for (let day = start, i = 0; day <= now; day += 86400000, i++) {
    if (day < from) continue;
    points.push({
      id: `fixture-${metal}-${i}`,
      source: "fixture" as const,
      pricePerOunceGBP: (
        base * (0.3 + (0.7 * (day - start)) / (now - start)) +
        Math.sin(i / 17) * base * 0.015
      ).toFixed(6),
      providerAt: new Date(day).toISOString(),
      fetchedAt: new Date(now).toISOString(),
    });
  }
  return {
    points: condense ? condenseObservations(points) : points,
    source: "fixture",
    from: new Date(from).toISOString(),
    to: new Date(now).toISOString(),
    totalObservations: points.length,
    gaps: [],
    metadata: {
      kind: "reference",
      availableFrom: new Date(start).toISOString(),
      fetchedAt: new Date(now).toISOString(),
      warning:
        "SIMULATED reference series for demo testing. Not historical market prices.",
    },
  };
}
