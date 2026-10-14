import BuybackPanel from "./components/buyback-panel";
import CustomerBuyback from "./components/customer-buyback";
import QuoteBuilder from "./components/quote-builder";
import MarketCard from "./components/market-card";
import StockPanel from "./components/stock-panel";
import ActivityPanel from "./components/activity-panel";
import QuoteHistory from "./components/quote-history";
import InventoryPanel from "./components/inventory-panel";
import CustomerView from "./components/customer-quote";
import SignIn from "./components/sign-in";
import { GoldMark, QuoteDetails, remaining } from "./components/quote-ui";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  History,
  Layers3,
  LayoutDashboard,
  LogOut,
  Plus,
  ShieldCheck,
  TrendingUp,
  X,
  Search,
  LockKeyhole,
} from "lucide-react";
import { Decimal } from "decimal.js";
import { api, ApiError } from "./api";
import { calculateQuote } from "../shared/pricing";
import type {
  DealerUser,
  Lot,
  PriceState,
  Quote,
  Workspace,
} from "../shared/types";
const nav = [
  ["overview", "Overview", LayoutDashboard],
  ["inventory", "Inventory", Layers3],
  ["quotes", "Quotes", FileText],
  ["buybacks", "Buy-backs", TrendingUp],
  ["activity", "Activity", History],
] as const;
export default function App() {
  const params = new URLSearchParams(location.search);
  if (params.has("buyback"))
    return (
      <CustomerBuyback
        id={params.get("buyback") || ""}
        token={params.get("token") || ""}
      />
    );
  if (params.has("quote"))
    return (
      <CustomerView
        id={params.get("quote") || ""}
        token={params.get("token") || ""}
      />
    );
  return <DealerAccess />;
}
function DealerAccess() {
  const [session, setSession] = useState<{
    user: DealerUser | null;
    demoAccounts: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function checkSession() {
    setError("");
    try {
      setSession(
        await api<{ user: DealerUser | null; demoAccounts: boolean }>(
          "/api/auth/session",
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to connect to your desk.",
      );
    }
  }
  useEffect(() => {
    void checkSession();
  }, []);
  if (!session)
    return (
      <main className="access-loading">
        <a className="customer-brand" href="/">
          <GoldMark />
          Aurum Register
        </a>
        <p role="status">
          {error
            ? "Your desk is temporarily unavailable."
            : "Opening your workspace…"}
        </p>
        {error && (
          <div className="alert" role="alert">
            {error}
            <button onClick={() => void checkSession()}>Try again</button>
          </div>
        )}
      </main>
    );
  if (!session.user)
    return (
      <SignIn
        demoAccounts={session.demoAccounts}
        notice={notice}
        onSignedIn={(user) => {
          setNotice("");
          setSession({ ...session, user });
        }}
      />
    );
  return (
    <Desk
      user={session.user}
      onSignedOut={(expired = false) => {
        setNotice(
          expired
            ? "Your session has ended. Sign in again to continue."
            : "You have signed out of the desk.",
        );
        setSession({ ...session, user: null });
      }}
    />
  );
}
function Desk({
  user,
  onSignedOut,
}: {
  user: DealerUser;
  onSignedOut: (expired?: boolean) => void;
}) {
  const [data, setData] = useState<Workspace | null>(null),
    [price, setPrice] = useState<PriceState | null>(null),
    [tab, setTab] = useState("overview"),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [selected, setSelected] = useState(""),
    [quantity, setQuantity] = useState(1),
    [margin, setMargin] = useState("3"),
    [reference, setReference] = useState(""),
    [busy, setBusy] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [created, setCreated] = useState<{ quote: Quote; token: string } | null>(
      null,
    ),
    [now, setNow] = useState(Date.now()),
    [copied, setCopied] = useState(false),
    [streamConnected, setStreamConnected] = useState(false);
  const composer = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    ticketDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (ticketOpen) ticketDialog.current?.showModal();
  }, [ticketOpen]);
  async function load() {
    try {
      const workspace = await api<Workspace>("/api/workspace");
      setData(workspace);
      setPrice(workspace.price);
      setError("");
      setSelected((current) => current || workspace.lots[0]?.id || "");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        onSignedOut(true);
        return;
      }
      setError(e instanceof Error ? e.message : "Unable to load workspace.");
    }
  }
  useEffect(() => {
    void load();
    const stream = new EventSource("/api/price/stream");
    stream.addEventListener("price", (event) => {
      try {
        setPrice(JSON.parse((event as MessageEvent).data));
        setStreamConnected(true);
      } catch {
        setStreamConnected(false);
      }
    });
    stream.onerror = () => setStreamConnected(false);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(() => void load(), 15000);
    return () => {
      stream.close();
      clearInterval(timer);
      clearInterval(refresh);
    };
  }, []);
  useEffect(() => {
    if (created) dialog.current?.showModal();
  }, [created]);
  const lot = data?.lots.find((x) => x.id === selected),
    snapshot = price?.snapshot;
  const stale =
    !snapshot ||
    Boolean(price?.stale) ||
    now - Date.parse(snapshot.providerAt) >
      (price?.maxAgeSeconds || 120) * 1000;
  useEffect(() => {
    if (lot) setMargin(String(lot.defaultPremiumBps / 100));
  }, [selected]);
  let estimate: {
    basePence: number;
    premiumPence: number;
    totalPence: number;
  } | null = null;
  try {
    if (lot && snapshot)
      estimate = calculateQuote({
        pricePerOunceGBP: snapshot.pricePerOunceGBP,
        weightMg: lot.weightMg,
        fineness: lot.fineness,
        quantity,
        marginBps: Math.round(Number(margin) * 100),
      });
  } catch {
    /* Invalid form values have no estimate. */
  }
  const available =
      data?.lots.reduce((sum, x) => sum + x.availableUnits, 0) || 0,
    reserved = data?.lots.reduce((sum, x) => sum + x.reservedUnits, 0) || 0;
  const liveQuotes =
    data?.quotes.filter(
      (x) => x.status === "open" && Date.parse(x.expiresAt) > now,
    ).length || 0;
  function choose(lot: Lot) {
    setSelected(lot.id);
    setMargin(String(lot.defaultPremiumBps / 100));
    setQuantity(1);
    setTab("overview");
    setTicketOpen(true);
  }
  async function issue(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const issued = await api<{ quote: Quote; token: string }>("/api/quotes", {
        method: "POST",
        body: JSON.stringify({
          lotId: selected,
          quantity,
          marginBps: Math.round(Number(margin) * 100),
          reference,
        }),
      });
      ticketDialog.current?.close();
      setCreated(issued);
      setCopied(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not issue quote.");
    } finally {
      setBusy(false);
    }
  }
  async function refreshPrice() {
    setRefreshing(true);
    try {
      setPrice(
        await api<PriceState>("/api/price/refresh", {
          method: "POST",
          body: "{}",
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh price.");
    } finally {
      setRefreshing(false);
    }
  }
  async function signOut() {
    setSigningOut(true);
    try {
      await api<void>("/api/auth/logout", { method: "POST", body: "{}" });
      onSignedOut();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to sign out. Please try again.",
      );
    } finally {
      setSigningOut(false);
    }
  }
  const quoteUrl = created
    ? `${location.origin}/?quote=${created.quote.id}&token=${created.token}`
    : "";
  return (
    <div className="app-shell counter-layout">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="ledger-nav">
        <div className="ledger-nav-inner">
          <a className="ledger-wordmark" href="/">
            <span className="register-mark" aria-hidden="true">
              AR
            </span>
            Aurum Register<span className="brand-edition">DESK</span>
          </a>
          <nav className="ledger-links" aria-label="Main navigation">
            {nav.map(([id, label, Icon]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => setTab(id)}
              >
                <Icon size={20} />
                <span>{id === "overview" ? "Prices" : label}</span>
              </button>
            ))}
          </nav>
          <div className="account-menu">
            <span className="account-initials">
              {user.name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
            <div>
              <strong>{user.name}</strong>
              <p>{user.role === "owner" ? "Owner" : "Staff"}</p>
            </div>
            <button onClick={() => void signOut()} disabled={signingOut}>
              <LogOut size={16} />
              Sign out
            </button>
          </div>
          <button
            className="mobile-signout"
            aria-label="Sign out"
            onClick={() => void signOut()}
            disabled={signingOut}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <div className="market-strip">
        <div className="market-strip-inner">
          <span className="strip-label">GOLD / GBP</span>
          <div
            className={"nav-ticker num " + (stale ? "is-stale" : "")}
            aria-label="Current gold price"
          >
            <span>Au</span>
            <strong>
              {snapshot
                ? new Intl.NumberFormat("en-GB", {
                    style: "currency",
                    currency: "GBP",
                  }).format(Number(snapshot.pricePerOunceGBP))
                : "Unavailable"}
            </strong>
            <i aria-hidden="true" />
            <small>{stale ? "Delayed" : "GBP / oz"}</small>
          </div>
          <div className="strip-rate">
            <span>Per gram</span>
            <strong>
              {snapshot
                ? "£" +
                  new Decimal(snapshot.pricePerOunceGBP)
                    .div("31.1034768")
                    .toFixed(2)
                : "Unavailable"}
            </strong>
          </div>
          <div className="strip-rate">
            <span>Per kilogram</span>
            <strong>
              {snapshot
                ? "£" +
                  new Decimal(snapshot.pricePerOunceGBP)
                    .div("31.1034768")
                    .times(1000)
                    .toNumber()
                    .toLocaleString("en-GB", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                : "Unavailable"}
            </strong>
          </div>
          <span className="strip-status">
            <i className={stale ? "delayed" : ""} />
            {stale
              ? "Feed delayed"
              : snapshot?.source === "fixture"
                ? "Simulated feed"
                : "Live price feed"}
            <span> · GBP</span>
          </span>
        </div>
      </div>
      <div className="main-shell">
        <main id="main">
          <div className="counter-heading">
            <div>
              <p className="counter-owner">
                {user.dealerName} <span>Demonstration account</span>
              </p>
              <h1>
                {tab === "overview"
                  ? "Market overview"
                  : tab === "inventory"
                    ? "Inventory"
                    : tab === "quotes"
                      ? "Quotations"
                      : tab === "buybacks"
                        ? "Buy-backs"
                        : "Activity"}
              </h1>
            </div>
            <button
              className="button primary new-ticket"
              disabled={!data}
              onClick={() => setTicketOpen(true)}
            >
              <Plus size={18} /> New quote
            </button>
          </div>
          {price?.quotePauseReason && (
            <p className="market-policy" role="status">
              {price.quotePauseReason}
            </p>
          )}
          {error && (
            <div className="alert" role="alert">
              {error}
              <button onClick={() => void load()}>Retry workspace</button>
            </div>
          )}
          {!data ? (
            <div className="loading" role="status">
              {error ? "Waiting for the API connection." : "Opening the desk…"}
            </div>
          ) : (
            <>
              {tab === "overview" && (
                <>
                  <div
                    className="counter-status"
                    aria-label="Workspace summary"
                  >
                    <span>
                      <strong>{available}</strong> units available
                    </span>
                    <button onClick={() => setTab("quotes")}>
                      <strong>{reserved}</strong> reserved{" "}
                      <ArrowUpRight size={14} />
                    </button>
                    <button onClick={() => setTab("quotes")}>
                      <strong>{liveQuotes}</strong> open quotes{" "}
                      <ArrowUpRight size={14} />
                    </button>
                    <span className="counter-date">
                      {new Date(now).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="counter-board">
                    <MarketCard
                      snapshot={snapshot}
                      stale={stale}
                      connected={streamConnected}
                      refreshing={refreshing}
                      error={price?.error}
                      onRefresh={() => void refreshPrice()}
                    />
                    <StockPanel
                      lots={data.lots}
                      selected={selected}
                      onChoose={choose}
                      onViewAll={() => setTab("inventory")}
                      snapshot={snapshot}
                    />
                  </div>
                </>
              )}
              {tab === "buybacks" && (
                <BuybackPanel
                  items={data.buybacks}
                  price={price}
                  role={user.role}
                  onUpdated={load}
                  now={now}
                />
              )}
              {tab === "inventory" && (
                <InventoryPanel
                  lots={data.lots}
                  search={search}
                  onSearch={setSearch}
                  onChoose={choose}
                  role={user.role}
                  onUpdated={load}
                />
              )}
              {tab === "quotes" && (
                <QuoteHistory
                  role={user.role}
                  onUpdated={load}
                  quotes={data.quotes}
                  now={now}
                  tab={tab}
                  onViewAll={() => setTab("quotes")}
                />
              )}
              {tab === "activity" && (
                <ActivityPanel events={data.events} tab={tab} />
              )}
            </>
          )}
          <div className="demo-notice">
            <span className="tiny-dot" />
            <p>
              Portfolio demonstration. Stock and customer references are
              fictional.
            </p>
            <span>No payments</span>
          </div>
          <footer className="desk-footer">
            <span>
              Aurum Register <b>·</b> Precious-metals inventory & quotations
            </span>
            <span>Fictional stock · No payments</span>
          </footer>
        </main>
      </div>
      <dialog
        ref={ticketDialog}
        className="ticket-drawer"
        aria-label="Create a quotation"
        onClose={() => setTicketOpen(false)}
      >
        <div className="ticket-drawer-top">
          <span>Aurum Register / Sales</span>
          <button
            className="icon-button"
            aria-label="Close quotation ticket"
            onClick={() => ticketDialog.current?.close()}
          >
            <X size={22} />
          </button>
        </div>
        {data && ticketOpen && (
          <>
            <QuoteBuilder
              composer={composer}
              lots={data.lots}
              lot={lot}
              selected={selected}
              quantity={quantity}
              margin={margin}
              reference={reference}
              busy={busy}
              stale={stale || Boolean(price?.marketClosed)}
              estimate={estimate}
              setSelected={(id) => {
                setSelected(id);
                setMargin(
                  String(
                    (data.lots.find((x) => x.id === id)?.defaultPremiumBps ||
                      0) / 100,
                  ),
                );
              }}
              setQuantity={setQuantity}
              setMargin={setMargin}
              setReference={setReference}
              issue={issue}
            />
          </>
        )}
      </dialog>
      <dialog
        ref={dialog}
        className="quote-dialog"
        aria-labelledby="issued-title"
        onCancel={() => setCreated(null)}
      >
        <div className="dialog-header">
          <span className="eyebrow">QUOTE ISSUED</span>
          <button
            className="icon-button"
            aria-label="Close quote"
            onClick={() => {
              dialog.current?.close();
              setCreated(null);
              void load();
            }}
          >
            <X size={20} />
          </button>
        </div>
        {created && (
          <>
            <h2 id="issued-title" className="sr-only">
              Quote issued for {created.quote.reference}
            </h2>
            <QuoteDetails quote={created.quote} now={now} />
            <p className="expiry">
              <Clock3 size={15} />
              Valid for {remaining(created.quote.expiresAt, now)}
            </p>
            <div className="share-actions">
              <a
                className="button primary"
                href={quoteUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open customer quote
                <ArrowUpRight size={16} />
              </a>
              <button
                className="button secondary"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(quoteUrl)
                    .then(() => setCopied(true))
                    .catch(() =>
                      setError(
                        "Copy is unavailable. Use the customer quote link.",
                      ),
                    );
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
            <p className="fineprint">
              The private link can accept this fictional quote. Share only with
              the intended recipient.
            </p>
          </>
        )}
      </dialog>
    </div>
  );
}
