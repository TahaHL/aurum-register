import type { FormEvent, RefObject } from "react";

import { ArrowRight, FileText, ShieldCheck } from "lucide-react";

import type { Lot } from "../../shared/types";

import { formatGBP } from "../../shared/pricing";

export default function QuoteBuilder({
  composer,

  lots,

  lot,

  selected,

  quantity,

  margin,

  reference,

  busy,

  stale,

  estimate,

  setSelected,

  setQuantity,

  setMargin,

  setReference,

  issue,
}: {
  composer: RefObject<HTMLDivElement | null>;

  lots: Lot[];

  lot: Lot | undefined;

  selected: string;

  quantity: number;

  margin: string;

  reference: string;

  busy: boolean;

  stale: boolean;

  estimate: {
    basePence: number;

    premiumPence: number;

    totalPence: number;
  } | null;

  setSelected: (id: string) => void;

  setQuantity: (value: number) => void;

  setMargin: (value: string) => void;

  setReference: (value: string) => void;

  issue: (event: FormEvent) => Promise<void>;
}) {
  return (
    <section className="panel composer" ref={composer}>
      <div className="section-title">
        <div>
          <h2>New quotation</h2>

          <p>Valid for five minutes from issue.</p>
        </div>

        <span className="round-icon">
          <FileText size={19} />
        </span>
      </div>

      <form onSubmit={(event) => void issue(event)}>
        <label>
          Inventory lot
          <select
            value={selected}

            onChange={(e) => {
              setSelected(e.target.value);

              setQuantity(1);
            }}
          >
            {lots.map((item) => (
              <option
                key={item.id}

                value={item.id}

                disabled={item.availableUnits === 0}
              >
                {item.name} · {item.availableUnits} available
              </option>
            ))}
          </select>
        </label>

        <div className="form-columns">
          <label>
            Quantity
            <input
              className="num"

              type="number"

              min="1"

              max={Math.min(lot?.availableUnits || 1, 100)}

              step="1"

              value={quantity}

              onChange={(e) => setQuantity(Number(e.target.value))}

              required
            />
          </label>

          <label>
            Dealer premium (%)
            <input
              className="num"

              type="number"

              min="0"

              max="20"

              step="0.01"

              value={margin}

              onChange={(e) => setMargin(e.target.value)}

              required
            />
          </label>
        </div>

        <label>
          Customer reference
          <input
            value={reference}

            onChange={(e) => setReference(e.target.value)}

            placeholder="e.g. DEMO-001"

            maxLength={80}

            required
          />
        </label>

        <div className="estimate">
          <p>
            <span>Gold value</span>

            <strong className="num">
              {estimate ? formatGBP(estimate.basePence) : "–"}
            </strong>
          </p>

          <p>
            <span>Dealer premium</span>

            <strong className="num">
              {estimate ? formatGBP(estimate.premiumPence) : "–"}
            </strong>
          </p>

          <p className="estimate-total">
            <span>Estimated quote</span>

            <strong className="num">
              {estimate ? formatGBP(estimate.totalPence) : "–"}
            </strong>
          </p>
        </div>

        <button
          className="button primary wide"

          disabled={busy || stale || !estimate || !lot?.availableUnits}
        >
          {busy
            ? "Issuing quote…"
            : stale
              ? "Fresh price required"
              : "Issue quote"}

          <ArrowRight size={17} />
        </button>

        <p className="fineprint">
          <ShieldCheck size={13} />
          Stock is held only when your customer accepts.
        </p>
      </form>
    </section>
  );
}
