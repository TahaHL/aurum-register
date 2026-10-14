import { Decimal } from "decimal.js";
// Integer milligrams and fineness / 10,000. Money rounds once at the GBP-pence boundary.
const TroyOunceGrams = new Decimal("31.1034768");
export function calculateQuote(input: {
  pricePerOunceGBP: string;
  weightMg: number;
  fineness: number;
  quantity: number;
  marginBps: number;
  direction?: "sell" | "buy";
}) {
  if (
    !Number.isInteger(input.weightMg) ||
    input.weightMg < 1 ||
    input.weightMg > 1000000 ||
    !Number.isInteger(input.fineness) ||
    input.fineness < 1 ||
    input.fineness > 10000 ||
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 100 ||
    !Number.isInteger(input.marginBps) ||
    input.marginBps < 0 ||
    input.marginBps > 2000
  )
    throw Error("Invalid quote inputs");
  const spot = new Decimal(input.pricePerOunceGBP);
  if (!spot.isFinite() || spot.lte(0) || spot.gt(100000))
    throw Error("Invalid spot price");
  const exactBase = spot
    .mul(input.weightMg)
    .div(1000)
    .mul(input.fineness)
    .div(10000)
    .mul(input.quantity)
    .div(TroyOunceGrams);
  const basePence = exactBase
    .mul(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  const totalPence = exactBase
    .mul(
      new Decimal(1).plus(
        new Decimal(input.marginBps)
          .div(10000)
          .mul(input.direction === "buy" ? -1 : 1),
      ),
    )
    .mul(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  return { basePence, premiumPence: totalPence - basePence, totalPence };
}
export const formatGBP = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    pence / 100,
  );
