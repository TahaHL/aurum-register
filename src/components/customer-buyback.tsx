import { useEffect, useRef, useState } from "react";
import type { Buyback } from "../../shared/types";
import { api } from "../api";
import { BuybackDetails } from "./buyback-panel";
import { GoldMark, remaining } from "./quote-ui";
export default function CustomerBuyback({
  id,
  token,
}: {
  id: string;
  token: string;
}) {
  const [item, setItem] = useState<Buyback | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now());
  const request = useRef(crypto.randomUUID());
  useEffect(() => {
    if (busy) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function refresh() {
      let terminal = false;
      try {
        const result = await api<{ buyback: Buyback }>(
          `/api/buybacks/${id}?token=${encodeURIComponent(token)}`,
          { signal: controller.signal },
        );
        if (active) {
          setItem(result.buyback);
          setError("");
          terminal = ["received", "cancelled", "expired"].includes(
            result.buyback.status,
          );
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Cannot refresh offer.");
      }
      if (active && !terminal) timer = setTimeout(() => void refresh(), 5000);
    }
    void refresh();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
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
      const result = await api<{ buyback: Buyback }>(
        `/api/buybacks/${id}/accept`,
        {
          method: "POST",
          body: JSON.stringify({ token, requestId: request.current }),
        },
      );
      setItem(result.buyback);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not accept offer.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="customer-shell">
      <a href="/" className="customer-brand">
        <GoldMark />
        Aurum Register
      </a>
      <p className="demo-line">Fictional buy-back offer · no payment is made</p>
      <main className="customer-card">
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        {!item ? (
          <p>Loading your offer…</p>
        ) : (
          <>
            <p className="customer-dealer">
              Your dealer · <strong>{item.dealerName}</strong>
            </p>
            <BuybackDetails item={item} />
            {item.status === "open" && (
              <>
                <p className="expiry">
                  Offer expires in {remaining(item.expiresAt, now)}
                </p>
                <button
                  className="button primary wide"
                  disabled={busy || Date.parse(item.expiresAt) <= now}
                  onClick={() => void accept()}
                >
                  {busy ? "Accepting…" : "Accept buy-back offer"}
                </button>
              </>
            )}
            <section className="customer-next">
              <h3>
                {item.status === "received"
                  ? "Your gold has been received"
                  : item.status === "accepted"
                    ? "Offer accepted — inspection next"
                    : item.status === "cancelled"
                      ? "This offer was cancelled"
                      : item.status === "expired"
                        ? "This offer has expired"
                        : "What happens next"}
              </h3>
              <p>
                {item.status === "received"
                  ? "The dealer recorded receipt and added the assessed gold to inventory. This does not confirm a payment."
                  : item.status === "expired" || item.status === "cancelled"
                    ? "Ask the dealer for a new assessment and quote."
                    : "Contact the dealer who sent this link. The owner must verify the gold matches the assessed weight, purity and quantity within 15 minutes of acceptance. If the assessment changes, a new offer is required."}
              </p>
              <p className="fineprint">
                Portfolio demo only. Do not send gold or money. Status refreshes
                automatically.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
