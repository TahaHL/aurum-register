import { expect, it } from "vitest";
import { chartSummary, condenseObservations, unitPrice } from "../shared/chart";
import type { PriceSnapshot } from "../shared/types";
const point = (price: number, index: number): PriceSnapshot => ({
  id: String(index),
  source: "fixture",
  pricePerOunceGBP: String(price),
  providerAt: new Date(index * 30000).toISOString(),
  fetchedAt: new Date(index * 30000).toISOString(),
});

it("converts troy ounces to grams and kilograms without using avoirdupois ounces", () => {
  expect(unitPrice("3110.34768", "g")).toBe(100);
  expect(unitPrice("3110.34768", "kg")).toBe(100000);
  expect(unitPrice("3110.34768", "oz")).toBe(3110.34768);
});
it("summarises the observed period and handles empty or flat data", () => {
  expect(chartSummary([], "oz")).toBeNull();
  expect(
    chartSummary([point(3000, 0), point(2900, 1), point(3300, 2)], "oz"),
  ).toEqual({
    first: 3000,
    last: 3300,
    low: 2900,
    high: 3300,
    change: 300,
    percent: 10,
  });
  expect(chartSummary([point(3000, 0)], "oz")?.change).toBe(0);
});
it("bounds chart payloads while preserving real extrema, endpoints and chronological order", () => {
  const points = Array.from({ length: 2000 }, (_, i) =>
    point(3000 + Math.sin(i), i),
  );
  points[900].pricePerOunceGBP = "4000";
  points[1401].pricePerOunceGBP = "2000";
  const sampled = condenseObservations(points, 20);
  expect(sampled.length).toBeLessThanOrEqual(20);
  expect(sampled[0]).toBe(points[0]);
  expect(sampled.at(-1)).toBe(points.at(-1));
  expect(sampled).toContain(points[900]);
  expect(sampled).toContain(points[1401]);
  expect(
    sampled.every(
      (p, i) =>
        points.includes(p) && (!i || p.providerAt > sampled[i - 1].providerAt),
    ),
  ).toBe(true);
});
