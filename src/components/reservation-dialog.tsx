import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { Quote } from "../../shared/types";
import { formatGBP } from "../../shared/pricing";
import { api } from "../api";
export default function ReservationDialog({
  quote,
  action,
  onClose,
  onSaved,
}: {
  quote: Quote;
  action: "sold" | "released";
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const attempt = useRef({ reason: "", id: crypto.randomUUID() });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sold = action === "sold";
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const note = reason.trim();
    if (note.length < 5) {
      setError("Add a reason of at least five characters.");
      return;
    }
    if (attempt.current.reason !== note)
      attempt.current = { reason: note, id: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      await api(`/api/reservations/${quote.reservation!.id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          action,
          reason: note,
          requestId: attempt.current.id,
        }),
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update the reservation.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="quote-dialog reservation-dialog"
      aria-labelledby="reservation-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <button
        className="icon-button close-dialog"
        aria-label="Close reservation dialog"
        disabled={busy}
        onClick={onClose}
      >
        <X size={20} />
      </button>
      <form onSubmit={(event) => void submit(event)}>
        <p className="eyebrow">{quote.reference}</p>
        <h2 id="reservation-title">
          {sold ? "Mark this reservation sold?" : "Release this reservation?"}
        </h2>
        <p>
          {quote.quantity} × {quote.lotName} · {formatGBP(quote.totalPence)}
        </p>
        <p className="reservation-explanation">
          {sold
            ? "This permanently removes the reserved units from inventory and records the sale at the original quoted price. Aurum Register does not collect or verify payment."
            : "The held units become available to other customers immediately. Total inventory stays the same. This quote cannot be accepted again."}
        </p>
        <label>
          Reason for {sold ? "sale" : "release"}
          <textarea
            autoFocus
            required
            minLength={5}
            maxLength={300}
            rows={3}
            value={reason}
            disabled={busy}
            placeholder={
              sold
                ? "e.g. Demo sale completed at the desk"
                : "e.g. Customer cancelled the order"
            }
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <div className="reservation-actions">
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy} type="submit">
            {busy ? "Saving…" : sold ? "Confirm sale" : "Confirm release"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
