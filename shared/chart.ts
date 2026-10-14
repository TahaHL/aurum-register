import { Decimal } from "decimal.js";
import type { PriceRange, ChartObservation } from "./types.js";

export const RANGE_MS: Record<PriceRange, number> = {
  "1h": 3600000,
  "6h": 21600000,
  "1d": 86400000,
  "7d": 604800000,
  "3m": 92 * 86400000,
  "6m": 184 * 86400000,
  "1y": 366 * 86400000,
  "2y": 732 * 86400000,
  "3y": 1098 * 86400000,
  "5y": 1830 * 86400000,
  "10y": 3660 * 86400000,
  all: Infinity,
};
export const PRICE_RANGES: PriceRange[] = [
  "1h",
  "6h",
  "1d",
  "7d",
  "3m",
  "6m",
  "1y",
  "2y",
  "3y",
  "5y",
  "10y",
  "all",
];
export function rangeStart(range: PriceRange, now: number): number {
  if (range === "all") return Date.UTC(1999, 0, 1);
  if (["1h", "6h", "1d", "7d"].includes(range)) return now - RANGE_MS[range];
  const months = range.endsWith("y") ? parseInt(range) * 12 : parseInt(range);
  const date = new Date(now),
    day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const last = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.getTime();
}
export type PriceUnit = "oz" | "g" | "kg";
export function unitPrice(value: string, unit: PriceUnit): number {
  const price = new Decimal(value);
  return (
    unit === "oz"
      ? price
      : price.div("31.1034768").times(unit === "kg" ? 1000 : 1)
  ).toNumber();
}
// Preserve first/last and each bucket's extrema. We never generate extra points
// or invent prices between observations to make the graph look fuller.
export function condenseObservations<T extends ChartObservation>(
  points: T[],
  limit = 500,
): T[] {
  if (points.length <= limit) return points;
  const buckets = Math.floor((limit - 2) / 2);
  const selected = new Set<number>([0, points.length - 1]);
  const span = (points.length - 2) / buckets;
  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = 1 + Math.floor(bucket * span),
      end = Math.min(points.length - 1, 1 + Math.floor((bucket + 1) * span));
    let low = start,
      high = start;
    for (let index = start; index < end; index++) {
      if (
        Number(points[index].pricePerOunceGBP) <
        Number(points[low].pricePerOunceGBP)
      )
        low = index;
      if (
        Number(points[index].pricePerOunceGBP) >
        Number(points[high].pricePerOunceGBP)
      )
        high = index;
    }
    selected.add(low);
    selected.add(high);
  }
  return [...selected].sort((a, b) => a - b).map((index) => points[index]);
}
export function chartSummary(points: ChartObservation[], unit: PriceUnit) {
  if (!points.length) return null;
  const values = points.map((point) => unitPrice(point.pricePerOunceGBP, unit));
  const first = values[0],
    last = values.at(-1)!;
  return {
    first,
    last,
    high: Math.max(...values),
    low: Math.min(...values),
    change: last - first,
    percent: ((last - first) / first) * 100,
  };
}
