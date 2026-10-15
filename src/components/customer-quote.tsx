import { useEffect, useRef, useState } from "react";
import { Clock3, ArrowRight, CheckCircle2 } from "lucide-react";
import { api } from "../api";
import type { Quote, Reservation } from "../../shared/types";
import { QuoteDetails, GoldMark, stamp, remaining } from "./quote-ui";
export default function CustomerView({
  id,
  token,
}: {
  id: string;
  token: string;
}) {
  const [quote, setQuote] = useState<Quote | null>(null),
    [error, setError] = useState(""),
    [syncError, setSyncError] = useState(""),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now());
  const requestId = useRef(crypto.randomUUID());
  useEffect(() => {
    if (busy) return;
    let active = true;
    let poll: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function refresh() {
      let terminal = false;
      try {
        const result = await api<{ quote: Quote }>(
          `/api/quotes/${id}?token=${encodeURIComponent(token)}`,
          { signal: controller.signal },
        );
        if (!active) return;
        setQuote(result.quote);
        setSyncError("");
        terminal =
          result.quote.reservation?.status === "sold" ||
          result.quote.reservation?.status === "released";
      } catch (e) {
        if (active)
          setSyncError(
            e instanceof Error ? e.message : "Unable to refresh this quote.",
          );
      }
      if (active && !terminal) poll = setTimeout(() => void refresh(), 5000);
    }
    void refresh();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(poll);
    };
  }, [id, token, busy]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function accept() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ reservation: Reservation }>(
        `/api/quotes/${id}/accept`,
        {
          method: "POST",
          body: JSON.stringify({ token, requestId: requestId.current }),
        },
      );
      setQuote((current) =>
        current
          ? { ...current, status: "accepted", reservation: result.reservation }
          : current,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reserve stock.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="customer-shell">
      <a href="/" className="customer-brand">
        <GoldMark />
        Hadj Lakehal Metals
      </a>
      <p className="demo-line">
        Fictional customer quote · no payment is taken
      </p>
      <main className="customer-card">
        {syncError && (
          <p className="alert" role="alert">
            {syncError} Displayed status may be out of date; retrying
            automatically.
          </p>
        )}
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {quote ? (
          <>
            <p className="customer-dealer">
              Your dealer · <strong>{quote.dealerName}</strong>
            </p>
            <QuoteDetails quote={quote} now={now} />
            {quote.reservation ? (
              <div className="success-box">
                <CheckCircle2 />
                <div>
                  <strong>
                    {quote.reservation.status === "sold"
                      ? "Your sale has been completed"
                      : quote.reservation.status === "held"
                        ? "Your stock is reserved"
                        : "This reservation has been released"}
                  </strong>
                  <p>
                    {quote.reservation.status === "sold"
                      ? "The dealer recorded this sale and removed the units from inventory. No payment was processed by Hadj Lakehal Metals."
                      : quote.reservation.status === "held"
                        ? `Hold ends at ${stamp(quote.reservation.expiresAt)}.`
                        : "Contact the dealer for a new quote."}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <p className="expiry num">
                  <Clock3 size={16} />
                  Quote expires in {remaining(quote.expiresAt, now)}
                </p>
                <div
                  className={
                    "expiry-progress " +
                    (Date.parse(quote.expiresAt) <= now
                      ? "expired"
                      : Date.parse(quote.expiresAt) - now < 60000
                        ? "warning"
                        : "")
                  }
                  aria-hidden="true"
                >
                  <span
                    style={{
                      width:
                        Math.max(
                          0,
                          Math.min(
                            100,
                            ((Date.parse(quote.expiresAt) - now) /
                              (Date.parse(quote.expiresAt) -
                                Date.parse(quote.createdAt))) *
                              100,
                          ),
                        ) + "%",
                    }}
                  />
                </div>
                {Date.parse(quote.expiresAt) <= now && (
                  <p className="expiry-notice">
                    This quote expired at{" "}
                    <span className="num">{stamp(quote.expiresAt)}</span>. Ask
                    the dealer for a new one.
                  </p>
                )}
                <button
                  className="button primary wide"
                  disabled={busy || Date.parse(quote.expiresAt) <= now}
                  onClick={() => void accept()}
                >
                  {busy
                    ? "Reserving…"
                    : Date.parse(quote.expiresAt) <= now
                      ? "Quote expired"
                      : "Accept & reserve stock"}
                  <ArrowRight size={17} />
                </button>
                <p className="fineprint">
                  Acceptance reserves the quoted quantity for 15 minutes. Quotes
                  alone do not hold stock.
                </p>
              </>
            )}
            <section className="customer-next" aria-labelledby="next-title">
              <h3 id="next-title">What happens next</h3>
              <p>
                {quote.reservation?.status === "sold"
                  ? "Contact the dealer who sent you this link for any follow-up. This page is a record of the demo sale."
                  : quote.reservation?.status === "released"
                    ? "Your hold has ended and the stock is available again. Contact the dealer who sent you this link for a fresh quote."
                    : "Contact the dealer who sent you this link to discuss the next step. An accepted quote holds stock for 15 minutes; the dealer can record a completed sale or release it early. Otherwise the hold expires automatically."}
              </p>
              <p className="fineprint">
                Portfolio demo · fictional stock. Do not send money. Reservation
                status refreshes automatically.
              </p>
            </section>
          </>
        ) : !error ? (
          <p role="status">Loading your quote…</p>
        ) : (
          <a href="/">Return to the desk</a>
        )}
      </main>
    </div>
  );
}
