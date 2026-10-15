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

export interface PriceTier {
  minQuantity: number;
  premiumBps: number;
}
export function validateTiers(tiers: PriceTier[]) {
  if (!tiers.length || tiers[0].minQuantity !== 1)
    throw Error("Tiers must start at one");
  tiers.forEach((t, i) => {
    if (
      !Number.isInteger(t.minQuantity) ||
      t.minQuantity < 1 ||
      t.minQuantity > 1000 ||
      !Number.isInteger(t.premiumBps) ||
      t.premiumBps < 0 ||
      t.premiumBps > 10000 ||
      (i > 0 &&
        (t.minQuantity <= tiers[i - 1].minQuantity ||
          t.premiumBps > tiers[i - 1].premiumBps))
    )
      throw Error("Invalid quantity tiers");
  });
}
export function priceProduct(input: {
  spot: string;
  fineWeightMgPerPack: number;
  quantity: number;
  tiers: PriceTier[];
}) {
  validateTiers(input.tiers);
  const spot = new Decimal(input.spot);
  if (
    !spot.isFinite() ||
    spot.lte(0) ||
    spot.gt(100000) ||
    !Number.isSafeInteger(input.fineWeightMgPerPack) ||
    input.fineWeightMgPerPack < 1 ||
    input.fineWeightMgPerPack > 100000000 ||
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 1000
  )
    throw Error("Invalid product price input");
  const tier = input.tiers
    .filter((t) => t.minQuantity <= input.quantity)
    .at(-1)!;
  const base = spot.mul(input.fineWeightMgPerPack).div(31103.4768).mul(100);
  const unitPence = base
    .mul(new Decimal(1).plus(new Decimal(tier.premiumBps).div(10000)))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  const basePence =
    base.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber() * input.quantity;
  const linePence = unitPence * input.quantity;
  if (!Number.isSafeInteger(linePence))
    throw Error("Price exceeds supported precision");
  return {
    tier,
    unitPence,
    linePence,
    basePence,
    premiumPence: linePence - basePence,
    perOuncePence: new Decimal(unitPence)
      .mul(31103.4768)
      .div(input.fineWeightMgPerPack)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber(),
  };
}
// Demo only: investment gold exemption and UK standard-rate other metals.
// Re-check HMRC Notice 701/21 and product eligibility before any real use.
export function vatFor(metal: import("./types.js").Metal, netPence: number) {
  if (!Number.isSafeInteger(netPence) || netPence < 0)
    throw Error("Invalid net price");
  return metal === "XAU"
    ? 0
    : new Decimal(netPence)
        .mul("0.20")
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        .toNumber();
}
export function buybackPrice(
  spot: string,
  fineWeightMgPerPack: number,
  discountBps: number,
) {
  if (!Number.isInteger(discountBps) || discountBps < 0 || discountBps > 10000)
    throw Error("Invalid discount");
  priceProduct({
    spot,
    fineWeightMgPerPack,
    quantity: 1,
    tiers: [{ minQuantity: 1, premiumBps: 0 }],
  });
  return new Decimal(spot)
    .mul(fineWeightMgPerPack)
    .div(31103.4768)
    .mul(100)
    .mul(new Decimal(1).minus(new Decimal(discountBps).div(10000)))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}
