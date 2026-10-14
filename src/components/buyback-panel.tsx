import { useEffect, useRef, useState, type FormEvent } from "react";
import { Decimal } from "decimal.js";
import type { Buyback, PriceState } from "../../shared/types";
import { calculateQuote, formatGBP } from "../../shared/pricing";
import { api } from "../api";
import { grams, remaining, stamp } from "./quote-ui";

export function BuybackDetails({ item }: { item: Buyback }) {
  return (
    <>
      <div className="quote-detail-top">
        <span className="eyebrow">{item.reference}</span>
        <span className={`status status-${item.status}`}>{item.status}</span>
      </div>
      <h2>{item.itemName}</h2>
      <p className="muted">
        {item.quantity} × {grams(item.weightMg)}g ·{" "}
        {(item.fineness / 100).toFixed(2)}% assessed purity
      </p>
      <div className="price-breakdown">
        <p>
          <span>Gold value</span>
          <strong>{formatGBP(item.basePence)}</strong>
        </p>
        <p>
          <span>Dealer discount ({item.discountBps / 100}%)</span>
          <strong>−{formatGBP(item.discountPence)}</strong>
        </p>
        <p className="total">
          <span>Dealer offers you</span>
          <strong>{formatGBP(item.totalPence)}</strong>
        </p>
      </div>
      <p className="fineprint">
        Fixed at {stamp(item.priceAt)}. Receipt is conditional on matching
        assessed weight, purity and quantity. No payment is processed.
      </p>
    </>
  );
}
export default function BuybackPanel({
  items,
  price,
  role,
  onUpdated,
  now,
}: {
  items: Buyback[];
  price: PriceState | null;
  role: "owner" | "staff";
  onUpdated: () => Promise<void>;
  now: number;
}) {
  const [fields, setFields] = useState({
    reference: "",
    itemName: "18ct jewellery scrap lot",
    weight: "20",
    purity: "75",
    quantity: "1",
    discount: "3",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [issued, setIssued] = useState<{
    buyback: Buyback;
    token: string;
  } | null>(null);
  const [outcome, setOutcome] = useState<{
    item: Buyback;
    action: "received" | "cancelled";
  } | null>(null);
  const [notice, setNotice] = useState("");
  function field(key: keyof typeof fields, value: string) {
    setFields((previous) => ({ ...previous, [key]: value }));
  }
  const payload = () => ({
    reference: fields.reference,
    itemName: fields.itemName,
    weightMg: new Decimal(fields.weight).times(1000).toNumber(),
    fineness: new Decimal(fields.purity).times(100).toNumber(),
    quantity: Number(fields.quantity),
    discountBps: new Decimal(fields.discount).times(100).toNumber(),
  });
  let estimate: number | null = null;
  try {
    if (price?.snapshot)
      estimate = calculateQuote({
        ...payload(),
        pricePerOunceGBP: price.snapshot.pricePerOunceGBP,
        marginBps: payload().discountBps,
        direction: "buy",
      }).totalPence;
  } catch {
    /* Invalid input has no estimate. */
  }
  const paused =
    !price?.snapshot ||
    price.stale ||
    price.marketClosed ||
    now - Date.parse(price.snapshot.providerAt) > price.maxAgeSeconds * 1000;
  async function issue(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setIssued(
        await api("/api/buybacks", {
          method: "POST",
          body: JSON.stringify(payload()),
        }),
      );
      await onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not issue buy-back.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="buyback-workspace">
      <section className="panel buyback-composer">
        <div className="section-title">
          <div>
            <span className="eyebrow">BUY FROM A CUSTOMER</span>
            <h2>Make a buy-back offer</h2>
            <p>Assessed gold value, less your dealer discount.</p>
          </div>
        </div>
        <form className="desk-form" onSubmit={(event) => void issue(event)}>
          <fieldset disabled={busy}>
            <label>
              Customer reference
              <input
                required
                maxLength={80}
                value={fields.reference}
                onChange={(e) => field("reference", e.target.value)}
              />
            </label>
            <label>
              Item description
              <input
                required
                minLength={2}
                maxLength={100}
                value={fields.itemName}
                onChange={(e) => field("itemName", e.target.value)}
              />
            </label>
            <div className="form-columns">
              <label>
                Assessed weight per unit (g)
                <input
                  required
                  type="number"
                  min="0.001"
                  max="1000"
                  step="0.001"
                  value={fields.weight}
                  onChange={(e) => field("weight", e.target.value)}
                />
              </label>
              <label>
                Assessed purity (%)
                <input
                  required
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={fields.purity}
                  onChange={(e) => field("purity", e.target.value)}
                />
              </label>
            </div>
            <div className="form-columns">
              <label>
                Units offered
                <input
                  required
                  type="number"
                  min="1"
                  max="100"
                  value={fields.quantity}
                  onChange={(e) => field("quantity", e.target.value)}
                />
              </label>
              <label>
                Buy-back discount (%)
                <input
                  required
                  type="number"
                  min="0"
                  max="20"
                  step="0.01"
                  value={fields.discount}
                  onChange={(e) => field("discount", e.target.value)}
                />
              </label>
            </div>
            <div className="estimate">
              <p className="estimate-total">
                <span>Estimated offer</span>
                <strong>{estimate === null ? "–" : formatGBP(estimate)}</strong>
              </p>
            </div>
            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}
            <button
              className="button primary wide"
              disabled={busy || paused || !estimate}
            >
              {busy
                ? "Issuing…"
                : paused
                  ? "Quoting paused"
                  : "Issue buy-back offer"}
            </button>
            <p className="fineprint">
              Valid for 5 minutes. After acceptance, the owner has 15 minutes to
              verify and receive the gold. A changed assessment needs a new
              quote.
            </p>
          </fieldset>
        </form>
        {issued && (
          <div className="buyback-share" role="status">
            <strong>Offer issued · {issued.buyback.reference}</strong>
            <a
              className="button secondary"
              target="_blank"
              rel="noreferrer"
              href={`/?buyback=${issued.buyback.id}&token=${issued.token}`}
            >
              Open customer buy-back
            </a>
            <p className="fineprint">
              Private demo link: share only with the intended customer.
            </p>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Buy-back offers</h2>
            <p>Latest 50 · gold enters stock only on confirmed receipt.</p>
          </div>
        </div>
        {notice && (
          <p className="inventory-success" role="status">
            {notice}
          </p>
        )}
        {!items.length && (
          <div className="empty">
            <strong>No buy-backs yet.</strong>
            <p>Assess a customer's gold and issue your first offer.</p>
          </div>
        )}
        <div className="buyback-list">
          {items.map((item) => {
            const expired =
              item.status === "open"
                ? Date.parse(item.expiresAt) <= now
                : item.status === "accepted" &&
                  Date.parse(item.receiveBy!) <= now;
            return (
              <article key={item.id} className="buyback-record">
                <BuybackDetails
                  item={expired ? { ...item, status: "expired" } : item}
                />
                {item.status === "open" && !expired && (
                  <p className="fineprint">
                    Acceptance closes in {remaining(item.expiresAt, now)}
                  </p>
                )}
                {item.status === "accepted" && !expired && (
                  <p className="fineprint">
                    Receive within {remaining(item.receiveBy!, now)}
                  </p>
                )}
                {role === "owner" &&
                  !["received", "cancelled"].includes(item.status) && (
                    <div className="reservation-actions">
                      {item.status === "accepted" && !expired && (
                        <button
                          className="button primary"
                          onClick={() =>
                            setOutcome({ item, action: "received" })
                          }
                        >
                          Inspect & receive
                        </button>
                      )}
                      <button
                        className="text-button"
                        onClick={() =>
                          setOutcome({ item, action: "cancelled" })
                        }
                      >
                        Cancel offer
                      </button>
                    </div>
                  )}
              </article>
            );
          })}
        </div>
      </section>
      {outcome && (
        <BuybackOutcome
          {...outcome}
          onClose={() => setOutcome(null)}
          onSaved={async () => {
            await onUpdated();
            setNotice(
              outcome.action === "received"
                ? "Gold received into inventory. No payment was processed."
                : "Offer cancelled. No stock changed.",
            );
          }}
        />
      )}
    </div>
  );
}
function BuybackOutcome({
  item,
  action,
  onClose,
  onSaved,
}: {
  item: Buyback;
  action: "received" | "cancelled";
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    attempt = useRef({ payload: "", id: crypto.randomUUID() });
  const [reason, setReason] = useState(""),
    [premium, setPremium] = useState("3"),
    [inspected, setInspected] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const body = {
        action,
        reason: reason.trim(),
        inspected,
        defaultPremiumBps: new Decimal(premium).times(100).toNumber(),
      };
      const payload = JSON.stringify(body);
      if (attempt.current.payload !== payload)
        attempt.current = { payload, id: crypto.randomUUID() };
      await api(`/api/buybacks/${item.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ ...body, requestId: attempt.current.id }),
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save outcome.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="quote-dialog reservation-dialog"
      aria-labelledby="buyback-outcome-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={(e) => void submit(e)}>
        <h2 id="buyback-outcome-title">
          {action === "received"
            ? "Confirm inspected gold"
            : "Cancel buy-back offer"}
        </h2>
        <BuybackDetails item={item} />
        {action === "received" && (
          <>
            <label className="check-label">
              <input
                required
                type="checkbox"
                checked={inspected}
                onChange={(e) => setInspected(e.target.checked)}
              />
              I verified the weight, purity and quantity match this offer.
            </label>
            <label>
              Resale premium (%)
              <input
                required
                type="number"
                min="0"
                max="20"
                step="0.01"
                value={premium}
                onChange={(e) => setPremium(e.target.value)}
              />
            </label>
          </>
        )}
        <label>
          Outcome reason
          <textarea
            required
            minLength={5}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <div className="reservation-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Back
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? "Saving…"
              : action === "received"
                ? "Confirm receipt"
                : "Confirm cancellation"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
