import { Decimal } from "decimal.js";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  LoaderCircle,
  PackagePlus,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Lot } from "../../shared/types";
import { api } from "../api";
import { grams } from "./quote-ui";

export default function InventoryDialog({
  lot,
  onClose,
  onSaved,
}: {
  lot?: Lot;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const attempt = useRef<{ fingerprint: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState({
    sku: "",
    name: "",
    description: "",
    weight: "10",
    purity: "99.99",
    units: "1",
    reason: "",
    direction: "add",
    premium: "3",
  });
  const adjusting = Boolean(lot);
  function field(key: keyof typeof fields, value: string) {
    setFields((previous) => ({ ...previous, [key]: value }));
    attempt.current = null;
    setError("");
  }
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const delta = (fields.direction === "remove" ? -1 : 1) * Number(fields.units);
  const projectedAvailable = lot ? lot.availableUnits + delta : 0;
  const projectedTotal = lot ? lot.totalUnits + delta : 0;
  const invalidAdjustment = Boolean(
    lot &&
    (!Number.isSafeInteger(delta) ||
      delta === 0 ||
      Math.abs(delta) > 10000 ||
      projectedAvailable < 0 ||
      projectedTotal > 10000),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    let payload: Record<string, unknown>;
    try {
      if (lot) {
        if (invalidAdjustment)
          throw Error(
            "Choose a whole number of units. Reserved stock cannot be removed.",
          );
        payload = { delta, reason: fields.reason.trim() };
      } else {
        const weightMg = new Decimal(fields.weight).times(1000);
        const fineness = new Decimal(fields.purity).times(100);
        if (!weightMg.isInteger() || !fineness.isInteger())
          throw Error(
            "Use up to three decimal places for grams and two for purity.",
          );
        payload = {
          sku: fields.sku.trim().toUpperCase(),
          name: fields.name.trim(),
          description: fields.description.trim(),
          weightMg: weightMg.toNumber(),
          fineness: fineness.toNumber(),
          totalUnits: Number(fields.units),
          defaultPremiumBps: new Decimal(fields.premium).times(100).toNumber(),
          reason: fields.reason.trim(),
        };
      }
      const fingerprint = JSON.stringify(payload);
      if (attempt.current?.fingerprint !== fingerprint)
        attempt.current = { fingerprint, id: crypto.randomUUID() };
      setBusy(true);
      const result = await api<{ lot: Lot }>(
        lot ? `/api/inventory/${lot.id}/adjust` : "/api/inventory",
        {
          method: "POST",
          body: JSON.stringify({ ...payload, requestId: attempt.current.id }),
        },
      );
      await onSaved(
        lot
          ? `${result.lot.name} corrected. ${result.lot.availableUnits} units available.`
          : `${result.lot.name} received. ${result.lot.totalUnits} units added to inventory.`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to save inventory. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="quote-dialog inventory-dialog"
      aria-labelledby="inventory-dialog-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <div className="dialog-header">
        <span className="eyebrow">
          {adjusting ? "OWNER STOCK CORRECTION" : "INVENTORY RECEIPT"}
        </span>
        <button
          className="icon-button"
          aria-label="Close inventory form"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <h2 id="inventory-dialog-title">
        {adjusting ? "Make the record right." : "Receive a new gold lot."}
      </h2>
      <p className="muted inventory-dialog-intro">
        {adjusting
          ? "Record the difference and why it happened. Existing quotes keep their original details."
          : "Record the weight and purity of each unit, then add the received quantity."}
      </p>
      {lot && (
        <div className="adjust-lot-summary">
          <div>
            <strong>{lot.name}</strong>
            <span>
              {lot.sku} · {grams(lot.weightMg)}g ·{" "}
              {(lot.fineness / 100).toFixed(2)}% pure
            </span>
          </div>
          <dl>
            <div>
              <dt>Total</dt>
              <dd>{lot.totalUnits}</dd>
            </div>
            <div>
              <dt>Available</dt>
              <dd>{lot.availableUnits}</dd>
            </div>
            <div>
              <dt>Reserved</dt>
              <dd>{lot.reservedUnits}</dd>
            </div>
          </dl>
        </div>
      )}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <form className="desk-form" onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy}>
          {!adjusting && (
            <>
              <div className="form-columns">
                <label>
                  SKU
                  <input
                    autoFocus
                    value={fields.sku}
                    onChange={(e) => field("sku", e.target.value.toUpperCase())}
                    placeholder="AU-BAR-025"
                    minLength={2}
                    maxLength={40}
                    pattern="[A-Za-z0-9][A-Za-z0-9\-]*"
                    title="Use letters, numbers and hyphens."
                    required
                  />
                </label>
                <label>
                  Lot name
                  <input
                    value={fields.name}
                    onChange={(e) => field("name", e.target.value)}
                    placeholder="25g gold bar"
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </label>
              </div>
              <label>
                Default resale premium (%)
                <input
                  required
                  type="number"
                  min="0"
                  max="20"
                  step="0.01"
                  value={fields.premium}
                  onChange={(e) => field("premium", e.target.value)}
                />
              </label>
              <label>
                Description <span className="optional">optional</span>
                <input
                  value={fields.description}
                  onChange={(e) => field("description", e.target.value)}
                  placeholder="Refiner, format or condition"
                  maxLength={300}
                />
              </label>
              <div className="form-columns">
                <label>
                  Weight per unit (g)
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.001"
                    max="1000"
                    step="0.001"
                    value={fields.weight}
                    onChange={(e) => field("weight", e.target.value)}
                    required
                  />
                  <small>Up to three decimal places</small>
                </label>
                <label>
                  Purity (%)
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={fields.purity}
                    onChange={(e) => field("purity", e.target.value)}
                    required
                  />
                  <small>99.99% = 999.9 fine gold</small>
                </label>
              </div>
            </>
          )}
          {adjusting ? (
            <div className="form-columns">
              <label>
                Correction
                <select
                  autoFocus
                  value={fields.direction}
                  onChange={(e) => field("direction", e.target.value)}
                >
                  <option value="add">Add units</option>
                  <option value="remove">Remove units</option>
                </select>
              </label>
              <label>
                Units
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="10000"
                  step="1"
                  value={fields.units}
                  onChange={(e) => field("units", e.target.value)}
                  required
                />
              </label>
            </div>
          ) : (
            <label>
              Units received
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="10000"
                step="1"
                value={fields.units}
                onChange={(e) => field("units", e.target.value)}
                required
              />
            </label>
          )}
          <label>
            {adjusting ? "Reason for correction" : "Receipt note"}
            <textarea
              rows={2}
              value={fields.reason}
              onChange={(e) => field("reason", e.target.value)}
              placeholder={
                adjusting
                  ? "e.g. Count reconciled after annual stocktake"
                  : "e.g. Sample shipment from refiner, receipt DEMO-025"
              }
              minLength={5}
              maxLength={300}
              required
            />
            <small>Saved with your name in the activity history</small>
          </label>
          {lot && (
            <div
              className={`adjust-preview ${invalidAdjustment ? "invalid" : ""}`}
              aria-live="polite"
            >
              <span>
                {invalidAdjustment
                  ? "This correction exceeds the available stock or lot limit."
                  : "After this correction"}
              </span>
              {!invalidAdjustment && (
                <strong>
                  {projectedAvailable} available{" "}
                  <small>· {projectedTotal} total</small>
                </strong>
              )}
            </div>
          )}
          <button
            className="button primary wide"
            disabled={busy || invalidAdjustment}
          >
            {busy ? (
              <>
                <LoaderCircle size={17} className="spin" />
                Saving inventory…
              </>
            ) : (
              <>
                {adjusting ? "Save stock correction" : "Receive lot"}
                {adjusting ? (
                  <ArrowRight size={17} />
                ) : (
                  <PackagePlus size={17} />
                )}
              </>
            )}
          </button>
        </fieldset>
        <p className="fineprint">
          <ShieldCheck size={13} />
          {adjusting
            ? "Reserved units stay protected. Every correction is recorded."
            : "Each unit in a lot shares the same weight and purity."}
        </p>
      </form>
    </dialog>
  );
}
