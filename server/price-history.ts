import type { SqlPool } from "./sql.js";
import type {
  PriceHistory,
  PriceRange,
  PriceSnapshot,
} from "../shared/types.js";
import { condenseObservations, RANGE_MS, rangeStart } from "../shared/chart.js";
import { HistoricalGold } from "./historical-gold.js";
export class PriceHistoryStore {
  private historical: HistoricalGold;
  constructor(
    private pool: SqlPool,
    private source: PriceSnapshot["source"],
    private clock = Date.now,
  ) {
    this.historical = new HistoricalGold(pool, clock);
  }
  async append(snapshot: PriceSnapshot) {
    await this.pool.query(
      "INSERT INTO price_observations(id,source,price_gbp,provider_at,fetched_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(source,provider_at) DO NOTHING",
      [
        snapshot.id,
        snapshot.source,
        snapshot.pricePerOunceGBP,
        snapshot.providerAt,
        snapshot.fetchedAt,
      ],
    );
  }
  async read(range: PriceRange): Promise<PriceHistory> {
    if (this.source !== "fixture" && !["1h", "6h", "1d"].includes(range))
      return this.historical.read(range);
    const to = new Date(this.clock()),
      from = new Date(rangeStart(range, to.getTime()));
    const result = await this.pool.query(
      "SELECT * FROM price_observations WHERE source=$1 AND provider_at>=$2 AND provider_at<=$3 ORDER BY provider_at DESC LIMIT 21000",
      [this.source, from, to],
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
    };
  }
  async prune() {
    await this.pool.query(
      "DELETE FROM price_observations WHERE provider_at<$1",
      [new Date(this.clock() - RANGE_MS["7d"])],
    );
  }
}
