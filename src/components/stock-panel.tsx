import { useId } from "react";
import { ArrowUpRight, ArrowRight, Check } from "lucide-react";
import type { Lot, PriceSnapshot } from "../../shared/types";
import { calculateQuote, formatGBP } from "../../shared/pricing";
import { grams } from "./quote-ui";

function BullionArt({ lot }: { lot: Lot }) {
  const finish = useId();
  const coin = lot.sku.includes("COIN"),
    scrap = lot.fineness < 9000;
  return (
    <svg
      className="bullion-product-art"
      viewBox="0 0 280 180"
      aria-hidden="true"
    >
      <defs><linearGradient id={finish} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#a57627"/><stop offset=".28" stopColor="#f7e5ab"/><stop offset=".5" stopColor="#c39c4c"/><stop offset=".75" stopColor="#f3db97"/><stop offset="1" stopColor="#a97a2f"/></linearGradient></defs>
      <ellipse cx="140" cy="160" rx="46" ry="5" fill="#18252e" opacity=".08" />
      <g fill={"url(#"+finish+")"} stroke="#9b702a" strokeWidth="1.5">
        {coin ? (
          <>
            <circle cx="140" cy="90" r="58" />
            <circle cx="140" cy="90" r="50" fill="none" />
            <path d="M116 105l15-39 12-13 13 14 12 38z" fill="none" />
            <text
              x="140"
              y="125"
              textAnchor="middle"
              stroke="none"
              fill="var(--gold-text)"
              fontSize="11"
              fontFamily="var(--font-num)"
            >
              {(lot.fineness / 10).toFixed(1)}
            </text>
          </>
        ) : scrap ? (
          <>
            <ellipse
              cx="115"
              cy="90"
              rx="28"
              ry="43"
              fill="none"
              strokeWidth="8"
            />
            <ellipse
              cx="163"
              cy="90"
              rx="28"
              ry="43"
              fill="none"
              strokeWidth="8"
            />
          </>
        ) : (
          <g transform="translate(140 90) rotate(-10)">
            <rect x="-42" y="-64" width="84" height="128" rx="6" />
            <rect
              x="-34"
              y="-56"
              width="68"
              height="112"
              rx="6"
              fill="none"
              opacity=".4"
            />
            <text
              x="0"
              y="-23"
              textAnchor="middle"
              stroke="none"
              fill="var(--gold-text)"
              fontFamily="var(--font-display)"
              fontSize="26"
            >
              Au
            </text>
            <text
              x="0"
              y="4"
              textAnchor="middle"
              stroke="none"
              fill="var(--gold-text)"
              fontFamily="var(--font-num)"
              fontSize="12"
            >
              {grams(lot.weightMg)} g
            </text>
            <text
              x="0"
              y="23"
              textAnchor="middle"
              stroke="none"
              fill="var(--gold-text)"
              fontFamily="var(--font-num)"
              fontSize="11"
            >
              {(lot.fineness / 10).toFixed(1)}
            </text>
            <path d="M-20 35h40" />
          </g>
        )}
      </g>
    </svg>
  );
}
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
    <section className="bullion-catalog" aria-labelledby="catalog-heading">
      <div className="catalog-heading">
        <div>
          <span className="eyebrow">AVAILABLE INVENTORY</span>
          <h2 id="catalog-heading">Bullion inventory</h2>
          <p>Select a lot to load it into your dealing ticket.</p>
        </div>
        <button className="text-button" onClick={onViewAll}>
          View all inventory <ArrowUpRight size={16} />
        </button>
      </div>
      <div className="bullion-grid">
        {lots.slice(0, 4).map((item) => {
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
            /* No usable indicative valuation. */
          }
          return (
            <article
              key={item.id}
              className={
                "bullion-card " + (selected === item.id ? "selected" : "")
              }
            >
              <div className="bullion-art">
                <span className="product-weight">
                  {grams(item.weightMg)}g GOLD
                </span>
                <BullionArt lot={item} />
              </div>
              <div className="bullion-card-body">
                <p className="product-sku">{item.sku}</p>
                <h3>{item.name}</h3>
                <p className="product-purity">
                  {(item.fineness / 100).toFixed(2)}% purity · per unit
                </p>
                <p
                  className={
                    "stock-availability " +
                    (!item.availableUnits ? "sold-out" : "")
                  }
                >
                  <Check size={13} />
                  {item.availableUnits
                    ? item.availableUnits + " units available"
                    : "Fully reserved"}
                </p>
                <p className="product-price">
                  {total === null ? "–" : formatGBP(total)}
                </p>
                <p className="product-price-note">
                  Indicative · includes {item.defaultPremiumBps / 100}% premium
                </p>
                <button
                  className="button secondary"
                  disabled={!item.availableUnits}
                  onClick={() => onChoose(item)}
                  aria-label={"Quote " + item.name}
                >
                  Quote this lot <ArrowRight size={15} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
