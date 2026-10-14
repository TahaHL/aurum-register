import {
  Check,
  ArrowDownLeft,
  FileText,
  PackagePlus,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { formatGBP } from "../../shared/pricing";
import type { Quote, LedgerEvent } from "../../shared/types";
export const grams = (mg: number) =>
  new Intl.NumberFormat("en-GB", { maximumFractionDigits: 3 }).format(
    mg / 1000,
  );
export const stamp = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(date));
export function remaining(expiresAt: string, now: number) {
  const secs = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  return `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
}
export function Status({ quote, now }: { quote: Quote; now: number }) {
  const text =
    quote.reservation?.status === "sold"
      ? "Sold"
      : quote.reservation?.status === "released"
        ? "Released"
        : quote.status === "accepted"
          ? "Reserved"
          : Date.parse(quote.expiresAt) <= now
            ? "Expired"
            : "Open";
  return (
    <span className={`status status-${text.toLowerCase()}`}>
      <i />
      {text}
    </span>
  );
}
export function GoldMark() {
  return (
    <svg width="29" height="29" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8 30l7-17h17l8 17-7 7H15z" fill="currentColor" />
      <path
        d="M15 13l6 17h19M21 30l-6 7"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="2.5"
      />
    </svg>
  );
}
export function EventRow({ event }: { event: LedgerEvent }) {
  const namedEvent: Record<string, string> = {
    "buyback.created": "Buy-back offered",
    "buyback.accepted": "Buy-back accepted",
    "buyback.received": "Buy-back received",
    "buyback.cancelled": "Buy-back cancelled",
    "inventory.premium": "Lot premium changed",
  };
  const reserved = event.type === "stock.reserved",
    sold = event.type === "stock.sold",
    released = event.type === "stock.released",
    received = event.type === "inventory.received",
    adjusted = event.type === "inventory.adjusted";
  return (
    <div className="event-row">
      <span className={`event-icon ${reserved ? "gold" : ""}`}>
        {received ? (
          <PackagePlus size={17} />
        ) : adjusted ? (
          <Settings2 size={17} />
        ) : reserved || sold ? (
          <Check size={17} />
        ) : released ? (
          <ArrowDownLeft size={17} />
        ) : (
          <FileText size={17} />
        )}
      </span>
      <div>
        <strong>
          {namedEvent[event.type] ||
            (sold
              ? "Sale completed"
              : received
                ? "Inventory received"
                : adjusted
                  ? "Stock corrected"
                  : reserved
                    ? "Stock reserved"
                    : released
                      ? "Reservation released"
                      : "Quote issued")}
        </strong>
        <p>
          {String(
            event.details.actorName ||
              event.details.reference ||
              "Expiry worker",
          )}
          {event.details.lotName ? " · " + String(event.details.lotName) : ""}
        </p>
        {(received ||
          adjusted ||
          sold ||
          released ||
          Boolean(event.details.reason)) && (
          <p className="event-reason">
            {typeof event.details.delta === "number"
              ? `${event.details.delta > 0 ? "+" : ""}${event.details.delta} units · `
              : ""}
            {String(event.details.reason || "")}
          </p>
        )}
      </div>
      <time className="num" dateTime={event.createdAt}>
        {stamp(event.createdAt)}
      </time>
    </div>
  );
}
export function QuoteDetails({ quote, now }: { quote: Quote; now: number }) {
  return (
    <>
      <div className="quote-detail-top">
        <span className="eyebrow">{quote.reference}</span>
        <Status quote={quote} now={now} />
      </div>
      <h2>{quote.lotName}</h2>
      <p className="muted">
        {quote.quantity} {quote.quantity === 1 ? "unit" : "units"} ·{" "}
        {grams(quote.weightMg)}g each · {(quote.fineness / 100).toFixed(2)}%
        pure
      </p>
      <div className="price-breakdown">
        <p>
          <span>Gold value</span>
          <strong className="num">{formatGBP(quote.basePence)}</strong>
        </p>
        <p>
          <span>Dealer premium ({(quote.marginBps / 100).toFixed(2)}%)</span>
          <strong className="num">{formatGBP(quote.premiumPence)}</strong>
        </p>
        <p className="total">
          <span>Quoted total</span>
          <strong className="num">{formatGBP(quote.totalPence)}</strong>
        </p>
      </div>
      <div className="snapshot-note">
        <ShieldCheck size={18} />
        <p>
          Price locked at {stamp(quote.priceAt)}. This quote keeps its original
          price when the market feed changes.
        </p>
      </div>
    </>
  );
}
