import { describe, it, expect } from "vitest";
import { calculateQuote } from "../shared/pricing";
const input = {
  pricePerOunceGBP: "2100.00",
  weightMg: 10000,
  fineness: 9999,
  quantity: 1,
  marginBps: 300,
};
describe("quote arithmetic", () => {
  it("uses milligrams, explicit purity and half-up pence rounding", () => {
    expect(calculateQuote(input)).toEqual({
      basePence: 67510,
      premiumPence: 2025,
      totalPence: 69535,
    });
  });
  it("accounts for 18 carat jewellery rather than pricing gross weight as pure gold", () => {
    const result = calculateQuote({
      ...input,
      weightMg: 20000,
      fineness: 7500,
      marginBps: 0,
    });
    expect(result).toEqual({
      basePence: 101275,
      premiumPence: 0,
      totalPence: 101275,
    });
  });
  it("rounds after multiplying the quantity, with a reconciling breakdown", () => {
    const result = calculateQuote({
      ...input,
      pricePerOunceGBP: "31.1034768",
      weightMg: 10250,
      fineness: 10000,
      quantity: 3,
    });
    expect(result.totalPence).toBe(result.basePence + result.premiumPence);
    expect(result.totalPence).toBe(3167);
  });
  it.each([
    { quantity: 0 },
    { quantity: 1.5 },
    { marginBps: -1 },
    { fineness: 10001 },
    { weightMg: 0 },
    { pricePerOunceGBP: "NaN" },
    { pricePerOunceGBP: "0" },
  ])("rejects invalid numerical inputs %j", (patch) => {
    expect(() => calculateQuote({ ...input, ...patch })).toThrow();
  });
});
