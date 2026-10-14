import { useEffect, useRef, useState, type FormEvent } from "react";
import { Decimal } from "decimal.js";
import type { Lot } from "../../shared/types";
import { api } from "../api";
export default function PremiumDialog({
  lot,
  onClose,
  onSaved,
}: {
  lot: Lot;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(String(lot.defaultPremiumBps / 100)),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/inventory/${lot.id}/premium`, {
        method: "POST",
        body: JSON.stringify({
          defaultPremiumBps: new Decimal(value).times(100).toNumber(),
          reason,
        }),
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to change premium.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="quote-dialog reservation-dialog"
      aria-labelledby="premium-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={(e) => void submit(e)}>
        <h2 id="premium-title">Default lot premium</h2>
        <p>{lot.name}</p>
        <p className="fineprint">
          Applies when this lot is selected for a new quote. Existing quotations
          keep their original price.
        </p>
        <label>
          Default premium (%)
          <input
            autoFocus
            required
            type="number"
            min="0"
            max="20"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <label>
          Reason for premium change
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
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            Save premium
          </button>
        </div>
      </form>
    </dialog>
  );
}
