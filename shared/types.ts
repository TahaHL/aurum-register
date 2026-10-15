export type Metal = "XAU" | "XAG" | "XPT" | "XPD";
export const METALS: Metal[] = ["XAU", "XAG", "XPT", "XPD"];
export const METAL_NAMES: Record<Metal, string> = {
  XAU: "Gold",
  XAG: "Silver",
  XPT: "Platinum",
  XPD: "Palladium",
};
export interface DealerUser {
  id: string;
  email: string;
  name: string;
  role: "owner" | "staff";
  dealerId: string;
  dealerName: string;
}
export interface CreateLotInput {
  defaultPremiumBps?: number;
  sku: string;
  name: string;
  description: string;
  weightMg: number;
  fineness: number;
  totalUnits: number;
  reason: string;
  requestId: string;
}
export interface AdjustStockInput {
  delta: number;
  reason: string;
  requestId: string;
}
export interface Lot {
  defaultPremiumBps: number;
  id: string;
  sku: string;
  name: string;
  description: string;
  weightMg: number;
  fineness: number;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
  acquiredAt: string;
}
export interface PriceSnapshot {
  id: string;
  pricePerOunceGBP: string;
  source: "fixture" | "goldapi" | "public-gold";
  providerAt: string;
  fetchedAt: string;
}
export interface MarketState extends PriceState {
  dayOpen: { pricePerOunceGBP: string; providerAt: string } | null;
  firstObservedAt: string | null;
}
export interface PriceState {
  marketClosed?: boolean;
  quotePauseReason?: string | null;
  snapshot: PriceSnapshot | null;
  stale: boolean;
  error: string | null;
  maxAgeSeconds: number;
}
export type PriceRange =
  | "1h"
  | "6h"
  | "1d"
  | "7d"
  | "1m"
  | "3m"
  | "6m"
  | "1y"
  | "2y"
  | "3y"
  | "5y"
  | "10y"
  | "all";
export type ChartObservation = Omit<PriceSnapshot, "source"> & {
  source: PriceSnapshot["source"] | "frankfurter";
};
export interface PriceHistory {
  points: ChartObservation[];
  source: ChartObservation["source"];
  from: string;
  to: string;
  totalObservations: number;
  gaps: { from: string; to: string }[];
  metadata?: {
    kind: "reference" | "observed";
    availableFrom: string;
    fetchedAt: string;
    warning?: string;
  };
}
export interface Quote {
  id: string;
  dealerName: string;
  reference: string;
  lotId: string;
  lotName: string;
  sku: string;
  quantity: number;
  weightMg: number;
  fineness: number;
  pricePerOunceGBP: string;
  priceSource: string;
  priceAt: string;
  basePence: number;
  premiumPence: number;
  totalPence: number;
  marginBps: number;
  createdAt: string;
  expiresAt: string;
  status: "open" | "accepted" | "expired";
  reservation: Reservation | null;
}
export interface Reservation {
  id: string;
  quoteId: string;
  quantity: number;
  status: "held" | "released" | "sold";
  closedAt: string | null;
  expiresAt: string;
  createdAt: string;
}
export interface LedgerEvent {
  id: string;
  type: string;
  createdAt: string;
  details: Record<string, unknown>;
}
export interface Workspace {
  lots: Lot[];
  buybacks: Buyback[];
  quotes: Quote[];
  events: LedgerEvent[];
  price: PriceState;
}

export interface Buyback {
  id: string;
  dealerName: string;
  reference: string;
  itemName: string;
  weightMg: number;
  fineness: number;
  quantity: number;
  discountBps: number;
  pricePerOunceGBP: string;
  priceSource: string;
  priceAt: string;
  basePence: number;
  discountPence: number;
  totalPence: number;
  status: "open" | "accepted" | "received" | "cancelled" | "expired";
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  receiveBy: string | null;
  closedAt: string | null;
  lotId: string | null;
}
