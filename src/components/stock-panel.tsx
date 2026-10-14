import { ArrowUpRight, ArrowRight } from "lucide-react";
import type { Lot, PriceSnapshot } from "../../shared/types";
import { calculateQuote, formatGBP } from "../../shared/pricing";
import { grams } from "./quote-ui";
export default function StockPanel({
  lots,
  selected,
  onChoose,
  onViewAll,
  snapshot,
}: {
  lots: Lot[];
  selected: string;
  onChoose: (lot: Lot) => void;
  onViewAll: () => void;
  snapshot: PriceSnapshot | null | undefined;
}) {
  return (
    <section className="stock-book" aria-labelledby="catalog-heading">
      <header className="stock-book-heading">
        <h2 id="catalog-heading">Available to quote</h2>
        <span>{lots.length} lots</span>
      </header>
      <div className="stock-book-columns" aria-hidden="true">
        <span>Gold / physical stock</span>
        <span>Indicative ask</span>
      </div>
      <div className="stock-book-list">
        {lots.slice(0, 6).map((item) => {
          let total: number | null = null;
          try {
            if (snapshot)
              total = calculateQuote({
                pricePerOunceGBP: snapshot.pricePerOunceGBP,
                weightMg: item.weightMg,
                fineness: item.fineness,
                quantity: 1,
                marginBps: item.defaultPremiumBps,
              }).totalPence;
          } catch {
            /* Price unavailable: issuing still requires a fresh feed. */
          }
          return (
            <button
              className="stock-book-row"
              key={item.id}
              disabled={!item.availableUnits}
              onClick={() => onChoose(item)}
              aria-label={"Quote " + item.name}
            >
              <span className="stock-book-name">
                <strong>{item.name}</strong>
                <small>
                  {grams(item.weightMg)}g · {(item.fineness / 100).toFixed(2)}%
                  fine
                </small>
              </span>
              <span className="stock-book-price">
                <strong>{total === null ? "–" : formatGBP(total)}</strong>
                <small>+{item.defaultPremiumBps / 100}% premium</small>
              </span>
              <span className="stock-book-count">
                {item.availableUnits} available
              </span>
              <ArrowUpRight className="stock-book-arrow" size={18} />
            </button>
          );
        })}
      </div>
      <button className="stock-book-all" onClick={onViewAll}>
        Open stock book <ArrowRight size={18} />
      </button>
      <p className="stock-book-note">
        Select a lot to prepare a fixed-price quote. Stock is reserved on
        customer acceptance.
      </p>
    </section>
  );
}
