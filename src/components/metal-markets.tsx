import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Decimal } from "decimal.js";
import {
  METALS,
  METAL_NAMES,
  type Metal,
  type PriceState,
  type MarketState,
} from "../../shared/types";
import { api } from "../api";
import MarketCard from "./market-card";

type States = Partial<Record<Metal, MarketState>>;
const currency = (value: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    value,
  );
const MarketsContext = createContext<{
  states: States;
  connected: boolean;
  now: number;
  stale: (metal: Metal) => boolean;
  setGold: (price: PriceState) => void;
} | null>(null);
export function MarketsProvider({ children }: { children: ReactNode }) {
  const [states, setStates] = useState<States>({});
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now());
  const setGold = (price: PriceState) =>
    setStates((old) => ({
      ...old,
      XAU: {
        ...old.XAU,
        dayOpen: old.XAU?.dayOpen || null,
        firstObservedAt: old.XAU?.firstObservedAt || null,
        ...price,
      },
    }));
  useEffect(() => {
    let active = true,
      received = false;
    void api<States>("/api/metals")
      .then((value) => {
        if (active && !received) setStates(value);
      })
      .catch(() => {});
    const stream = new EventSource("/api/price/stream");
    stream.addEventListener("metals", (event) => {
      try {
        const value = JSON.parse(event.data);
        if (active) {
          received = true;
          setStates(value);
          setConnected(true);
        }
      } catch {
        setConnected(false);
      }
    });
    stream.addEventListener("price", (event) => {
      try {
        if (active) {
          setGold(JSON.parse(event.data));
          setConnected(true);
        }
      } catch {
        setConnected(false);
      }
    });
    stream.onerror = () => setConnected(false);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      stream.close();
      clearInterval(timer);
    };
  }, []);
  const stale = (metal: Metal) =>
    !states[metal]?.snapshot ||
    Boolean(states[metal]?.stale) ||
    now - Date.parse(states[metal]!.snapshot!.providerAt) > 120000;
  return (
    <MarketsContext.Provider value={{ states, connected, now, stale, setGold }}>
      {children}
    </MarketsContext.Provider>
  );
}
export function useMarkets() {
  const context = useContext(MarketsContext);
  if (!context) throw new Error("MarketsProvider is required");
  return context;
}
export function MetalTicker() {
  const { states, connected, stale, now } = useMarkets();
  const times = METALS.map((m) => states[m]?.snapshot?.providerAt).filter(
    (s): s is string => Boolean(s),
  );
  const oldest = times.sort()[0];
  return (
    <section className="metals-ticker" aria-label="Precious metal spot prices">
      <div className="metals-ticker-cells">
        {METALS.map((metal) => {
          const price = states[metal]?.snapshot;
          const opening = states[metal]?.dayOpen;
          const change =
            price && opening
              ? new Decimal(price.pricePerOunceGBP)
                  .minus(opening.pricePerOunceGBP)
                  .toNumber()
              : null;
          const percent =
            change !== null && opening
              ? new Decimal(change)
                  .div(opening.pricePerOunceGBP)
                  .times(100)
                  .toNumber()
              : null;
          return (
            <a
              href={`/prices/${metal.toLowerCase()}`}
              className="metal-cell"
              key={metal}
              aria-label={`${METAL_NAMES[metal]} price chart`}
            >
              <span>
                {METAL_NAMES[metal]}{" "}
                <small>
                  {{ XAU: "Au", XAG: "Ag", XPT: "Pt", XPD: "Pd" }[metal]}
                </small>
              </span>
              <strong
                aria-label={`Current ${METAL_NAMES[metal].toLowerCase()} price`}
              >
                {price
                  ? currency(Number(price.pricePerOunceGBP))
                  : "Unavailable"}
                <small> / oz</small>
              </strong>
              <span
                className={
                  change !== null && change < 0 ? "metal-fall" : "metal-change"
                }
              >
                {change === null
                  ? "Day change unavailable"
                  : `${change < 0 ? "↓" : change > 0 ? "↑" : "→"} ${currency(Math.abs(change))} (${percent! >= 0 ? "+" : ""}${percent!.toFixed(2)}%)`}
              </span>
              <small>
                {stale(metal)
                  ? "Stale / unavailable"
                  : price?.source === "fixture"
                    ? "Simulated"
                    : "Live"}
              </small>
            </a>
          );
        })}
      </div>
      <p className="metals-ticker-note">
        {connected ? "● Connected" : "○ Reconnecting"} · GBP / troy oz ·{" "}
        {oldest
          ? `Updated ${new Date(oldest).toLocaleTimeString("en-GB", { timeZone: "Europe/London" })} UK (oldest feed)`
          : "Waiting for prices"}
        <span>
          Change from first recorded price since 00:00 UK time; not exchange
          open.
        </span>
      </p>
    </section>
  );
}
export function PublicMarkets() {
  const code = location.pathname.split("/")[2]?.toUpperCase();
  const metal: Metal = METALS.includes(code as Metal) ? (code as Metal) : "XAU";
  const { states, connected, stale } = useMarkets();
  const state = states[metal];
  const firstCollected = state?.firstObservedAt;
  return (
    <div className="public-markets">
      <nav aria-label="Skip navigation"><a className="skip-link" href="#market-main">
        Skip to content
      </a></nav>
      <div
        className="store-utility"
        role="region"
        aria-label="Demo information"
      >
        Fictional portfolio demonstration · No payments or real trading{" "}
        <a href="/desk">Dealer sign in</a>
      </div>
      <header className="store-header">
        <a className="store-brand" href="/store">
          HADJ LAKEHAL<span>METALS</span>
        </a>
        <nav aria-label="Metal charts">
          {METALS.map((m) => (
            <a
              href={`/prices/${m.toLowerCase()}`}
              aria-current={m === metal ? "page" : undefined}
              key={m}
            >
              {METAL_NAMES[m]}
            </a>
          ))}
        </nav>
      </header>
      <MetalTicker />
      <main id="market-main" className="public-market-main">
        <p className="market-breadcrumb">Price charts / {METAL_NAMES[metal]}</p>
        <h1>{METAL_NAMES[metal]} price</h1>
        <p className="market-intro">
          GBP spot prices, with a record of when each observation was collected.
        </p>
        {metal !== "XAU" && (
          <p className="collection-notice">
            Collecting {METAL_NAMES[metal].toLowerCase()} observations
            {firstCollected
              ? ` since ${new Date(firstCollected).toLocaleDateString("en-GB")}`
              : " when the feed becomes available"}
            . Live and 1 day show collected prices, retained for seven days.
            Longer ranges use daily reference prices.
          </p>
        )}
        <MarketCard
          key={metal}
          metal={metal}
          snapshot={state?.snapshot}
          stale={stale(metal)}
          connected={connected}
          refreshing={false}
          error={state?.error}
        />
      </main>
      <footer className="store-footer">
        <strong>Hadj Lakehal Metals</strong>
        <p>Fictional stock. No payments, shipping or real trading.</p>
        <a href="/desk">Open dealer workspace</a>
        <p>
          Market prices are indicative. This demonstration provides no
          investment or tax advice.
        </p>
      </footer>
    </div>
  );
}
