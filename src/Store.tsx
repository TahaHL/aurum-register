import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ShoppingBag,
  Menu,
  X,
  Search,
} from "lucide-react";
import { MetalTicker } from "./components/metal-markets";
import { api } from "./api";
import { formatGBP } from "../shared/pricing";
import "./store.css";

const categories = [
  ["gold-bars", "Gold bars"],
  ["gold-coins", "Gold coins"],
  ["silver-coins", "Silver coins"],
  ["silver-bars", "Silver bars"],
  ["platinum", "Platinum"],
  ["palladium", "Palladium"],
];
export function BullionIllustration({
  product,
  large = false,
}: {
  product: any;
  large?: boolean;
}) {
  const gold = product.metal === "XAU",
    coin = product.form === "coin";
  const colour = gold ? "#d5b368" : "#bac2c8",
    dark = gold ? "#9c7834" : "#7c8994";
  const weight = product.fine_weight_mg_per_pack
    ? `${(product.fine_weight_mg_per_pack / 1000).toLocaleString("en-GB")} g`
    : "1 oz";
  return (
    <svg
      className={`shop-bullion-illustration ${large ? "large" : ""}`}
      viewBox="0 0 320 260"
      role="img"
      aria-label={`Original illustration of a ${product.metal === "XAU" ? "gold" : "silver-coloured"} ${product.form}`}
    >
      <ellipse cx="162" cy="224" rx="92" ry="12" fill="#182c3910" />
      {coin ? (
        <>
          <circle cx="160" cy="127" r="91" fill={dark} />
          <circle
            cx="156"
            cy="122"
            r="87"
            fill={colour}
            stroke="#ffffff80"
            strokeWidth="3"
          />
          <circle
            cx="156"
            cy="122"
            r="77"
            fill="none"
            stroke={dark}
            strokeDasharray="1 4"
            strokeWidth="3"
          />
          <circle cx="156" cy="122" r="68" fill="none" stroke={dark} />
        </>
      ) : (
        <>
          <path d="M96 32 L232 43 L216 218 L80 207 Z" fill={dark} />
          <path
            d="M89 24 L225 35 L209 210 L73 199 Z"
            fill={colour}
            stroke="#ffffff90"
            strokeWidth="3"
          />
          <path
            d="M99 37 L212 47 L199 196 L86 186 Z"
            fill="none"
            stroke={dark}
          />
        </>
      )}
      <text
        x="153"
        y="92"
        textAnchor="middle"
        fill="#313b40"
        fontSize="12"
        letterSpacing="4"
      >
        HLM
      </text>
      <path
        d="M127 120 l26 -19 26 19 -26 22 Z M127 120 l26 5 26 -5 M153 101 v41"
        stroke="#313b40"
        fill="none"
        strokeWidth="1.5"
      />
      <text
        x="153"
        y="164"
        textAnchor="middle"
        fill="#313b40"
        fontSize="16"
        fontFamily="Geist Mono Variable,monospace"
      >
        {weight}
      </text>
      <text
        x="153"
        y="181"
        textAnchor="middle"
        fill="#313b40"
        fontSize="8"
        letterSpacing="2"
      >
        DEMO ILLUSTRATION
      </text>
    </svg>
  );
}
function ProductCard({ p, onAdd }: { p: any; onAdd: (p: any) => void }) {
  return (
    <article className="shop-card">
      <a className="shop-card-art" href={`/products/${p.slug}`}>
        <BullionIllustration product={p} />
        <span className="shop-tag">
          {p.pack_quantity > 1 ? `Pack of ${p.pack_quantity}` : p.form}
        </span>
      </a>
      <div className="shop-card-copy">
        <p className="shop-maker">{p.brand}</p>
        <h3>
          <a href={`/products/${p.slug}`}>{p.name}</a>
        </h3>
        <p className={`shop-stock ${p.available ? "" : "empty"}`}>
          {p.available
            ? `${p.available} available · fictional stock`
            : "Awaiting stock"}
        </p>
        <div className="shop-price-row">
          <div>
            <small>Price incl. demo VAT</small>
            <strong>
              {p.pricing ? formatGBP(p.pricing.totalPence) : "Unavailable"}
            </strong>
          </div>
          <button
            onClick={() => onAdd(p)}
            disabled={!p.available || p.stale}
            aria-label={`Add ${p.name} to basket`}
          >
            <ShoppingBag size={18} />
          </button>
        </div>
        <p className="shop-price-time">
          {p.pricing
            ? `${formatGBP(p.pricing.perOuncePence)} / oz before VAT · `
            : ""}
          {p.stale
            ? "Price unavailable / stale"
            : `${p.source === "fixture" ? "Simulated" : "Spot"} · ${p.priceAt ? new Date(p.priceAt).toLocaleTimeString("en-GB") : ""}`}
        </p>
      </div>
    </article>
  );
}
export default function Store() {
  const path = location.pathname,
    params = new URLSearchParams(location.search),
    category = params.get("category") || "";
  const [menu, setMenu] = useState(false),
    [data, setData] = useState<any>(null),
    [product, setProduct] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [qty, setQty] = useState(1),
    [brand, setBrand] = useState(""),
    [sort, setSort] = useState("featured"),
    [inStock, setInStock] = useState(false),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(24),
    [basket, setBasket] = useState<any[]>([]);
  const [form, setForm] = useState(params.get("form") || ""),
    [weight, setWeight] = useState(""),
    [tag, setTag] = useState(params.get("tag") || "");
  const [holdings, setHoldings] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null),
    [orders, setOrders] = useState<any[]>([]),
    [lock, setLock] = useState<any>(null),
    [confirmation, setConfirmation] = useState<any>(null),
    [busy, setBusy] = useState(false);
  const isProduct = path.startsWith("/products/"),
    isHome = path === "/" || path === "/store",
    isBasket = path === "/basket",
    isAccount = path === "/account",
    isCheckout = path === "/checkout",
    isSell = path === "/sell-to-us";
  const loadBasket = () =>
    api<any>("/api/shop/basket")
      .then((x) => setBasket(x.items))
      .catch(() => {});
  useEffect(() => {
    void loadBasket();
    void api<any>("/api/shop/session")
      .then(setCustomer)
      .catch(() => {});
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        if (isProduct) {
          const value = await api<any>(
            `/api/products/${path.split("/")[2]}?qty=${qty}`,
          );
          if (active) setProduct(value);
        } else if (isHome || path === "/catalogue" || isSell) {
          const query = new URLSearchParams({
            qty: String(qty),
            sort,
            page: String(page),
            pageSize: String(isHome ? 100 : pageSize),
          });
          if (category) query.set("category", category);
          if (brand) query.set("brand", brand);
          if (form) query.set("form", form);
          if (weight) query.set("weight", weight);
          if (tag) query.set("tag", tag);
          if (params.get("design")) query.set("design", params.get("design")!);
          if (inStock) query.set("inStock", "true");
          const value = await api<any>(`/api/catalogue?${query}`);
          if (active) setData(value);
        }
      } catch (e) {
        if (active) setError(String(e));
      }
    };
    void load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [
    path,
    qty,
    brand,
    form,
    weight,
    tag,
    sort,
    inStock,
    page,
    pageSize,
    category,
  ]);
  useEffect(() => {
    if (isAccount && customer?.id) {
      void api<any[]>("/api/shop/orders")
        .then(setOrders)
        .catch((e) => setError(String(e)));
      void api<any[]>("/api/shop/holdings")
        .then(setHoldings)
        .catch((e) => setError(String(e)));
    }
  }, [customer, isAccount]);
  async function add(p: any) {
    try {
      await api("/api/shop/basket", {
        method: "POST",
        body: JSON.stringify({
          productId: p.id,
          quantity: isProduct ? qty : 1,
        }),
      });
      await loadBasket();
      setNotice(`${p.name} added to your demo basket.`);
    } catch (e) {
      setError(String(e));
    }
  }
  async function demoLogin() {
    setBusy(true);
    try {
      setCustomer(await api("/api/shop/demo", { method: "POST", body: "{}" }));
      await loadBasket();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function beginCheckout() {
    setBusy(true);
    try {
      const next = await api<any>("/api/shop/lock", {
        method: "POST",
        body: "{}",
      });
      if (lock)
        setNotice(
          `Price lock refreshed: ${formatGBP(lock.totalPence)} → ${formatGBP(next.totalPence)}. Review the new total before ordering.`,
        );
      setLock(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function placeOrder() {
    if (!lock) return;
    setBusy(true);
    try {
      const result = await api<any>("/api/shop/orders", {
        method: "POST",
        body: JSON.stringify({ lockId: lock.id, requestId: lock.requestId }),
      });
      setConfirmation(result);
      await loadBasket();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const title =
    categories.find((c) => c[0] === category)?.[1] || "The collection";
  return (
    <div className="hlm-shop">
      <nav aria-label="Skip navigation"><a className="skip-link" href="#shop-main">
        Skip to content
      </a></nav>
      <div
        className="shop-utility"
        role="region"
        aria-label="Demo store information"
      >
        <span>Fictional demo store. No real payments.</span>
        <a href="/account">
          {customer?.id ? "Your account" : "Customer sign in"}
        </a>
      </div>
      <header className="shop-header">
        <a className="shop-wordmark" href="/store">
          HADJ LAKEHAL<span>M E T A L S</span>
        </a>
        <div className="shop-header-right">
          <a href="/prices/xau" className="shop-market-link">
            Follow the markets <ArrowUpRight size={16} />
          </a>
          <a href="/basket" className="shop-basket">
            <ShoppingBag size={20} /> Basket{" "}
            <span>{basket.reduce((n, p) => n + p.quantity, 0)}</span>
          </a>
          <button
            className="shop-menu-button"
            aria-expanded={menu}
            aria-controls="shop-nav"
            onClick={() => setMenu(!menu)}
            aria-label="Toggle navigation"
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <nav
        id="shop-nav"
        className={`shop-nav ${menu ? "open" : ""}`}
        aria-label="Shop navigation"
      >
        <details>
          <summary>Gold</summary>
          <div>
            {categories.slice(0, 2).map(([id, name]) => (
              <a key={id} href={`/catalogue?category=${id}`}>
                {name}
              </a>
            ))}
            <a href="/catalogue?category=gold-coins">Britannias & sovereigns</a>
          </div>
        </details>
        <details>
          <summary>Silver</summary>
          <div>
            {categories.slice(2, 4).map(([id, name]) => (
              <a key={id} href={`/catalogue?category=${id}`}>
                {name}
              </a>
            ))}
          </div>
        </details>
        <a href="/catalogue?category=platinum">Platinum</a>
        <a href="/catalogue?category=palladium">Palladium</a>
        <a href="/prices/xau">Price charts</a>
        <a href="/sell-to-us">Sell to us</a>
        <a href="/guides">Guides</a>
        <a className="shop-nav-all" href="/catalogue">
          Explore all <ArrowRight size={15} />
        </a>
      </nav>
      <MetalTicker />
      <main id="shop-main">
        {error && (
          <div className="shop-message" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}
        {notice && (
          <div className="shop-message" role="status">
            {notice} <a href="/basket">View basket →</a>
          </div>
        )}
        {isHome && (
          <>
            <section className="shop-hero">
              <div className="shop-hero-copy">
                <p className="shop-eyebrow">THE BULLION COLLECTION / 2026</p>
                <h1>
                  Precious metals.
                  <br />A clearer perspective.
                </h1>
                <p>
                  Explore gold, silver, platinum and palladium. Compare weights,
                  follow the market and see exactly how a bullion order is
                  priced.
                </p>
                <a
                  className="shop-button"
                  href="/catalogue?category=gold-coins"
                >
                  Discover gold coins <ArrowRight size={19} />
                </a>
                <span className="shop-hero-note">
                  A working portfolio store. Every purchase is simulated.
                </span>
              </div>
              <a
                className="shop-hero-art"
                href="/catalogue?category=gold-coins"
              >
                <span className="shop-edition">01 / GOLD COINS</span>
                <BullionIllustration
                  large
                  product={{ metal: "XAU", form: "coin" }}
                />
                <div>
                  <strong>The Britannia collection</strong>
                  <span>
                    Explore coins & fractional weights{" "}
                    <ArrowUpRight size={20} />
                  </span>
                </div>
              </a>
            </section>
            <div className="shop-principles">
              <span>
                <b>01</b> Transparent spot + premium pricing
              </span>
              <span>
                <b>02</b> Quantity breaks, clearly shown
              </span>
              <span>
                <b>03</b> Simulated checkout. No card details.
              </span>
            </div>
            <section className="shop-section">
              <div className="shop-section-title">
                <h2>Find your metal.</h2>
                <a href="/catalogue">
                  View the collection <ArrowRight size={17} />
                </a>
              </div>
              <div className="shop-categories">
                {categories.map(([id, name], i) => (
                  <a key={id} href={`/catalogue?category=${id}`}>
                    <span>0{i + 1}</span>
                    <h3>{name}</h3>
                    <ArrowUpRight size={22} />
                  </a>
                ))}
              </div>
            </section>
            <section className="shop-section">
              <div className="shop-section-title">
                <div>
                  <p className="shop-eyebrow">A PLACE TO START</p>
                  <h2>Popular in the demo collection.</h2>
                </div>
                <a href="/catalogue">
                  Browse all 110 products <ArrowRight size={17} />
                </a>
              </div>
              <div className="shop-grid">
                {data?.items
                  .filter((p: any) => p.tags.includes("best-seller"))
                  .slice(0, 4)
                  .map((p: any) => (
                    <ProductCard key={p.id} p={p} onAdd={add} />
                  ))}
              </div>
            </section>
            <section className="shop-market-story">
              <p className="shop-eyebrow">KNOW WHAT MOVES THE PRICE</p>
              <h2>
                Every metal has a story.
                <br />
                Start with the numbers.
              </h2>
              <p>
                Compare live observations with daily reference data. Switch
                between grams, troy ounces and kilograms, and download the
                series.
              </p>
              <a href="/prices/xau">
                Explore price charts <ArrowUpRight size={20} />
              </a>
            </section>
          </>
        )}
        {(path === "/catalogue" || isSell) && (
          <section className="shop-section">
            <p className="shop-eyebrow">
              HOME / {isSell ? "SELL TO US" : "COLLECTION"}
            </p>
            <h1>{isSell ? "Indicative buy-back prices" : title}</h1>
            <p className="shop-lead">
              {isSell
                ? "A read-only demonstration of spot less the dealer discount. No items are purchased here."
                : "Original illustrations. Fictional stock. Prices calculated from timestamped spot rates."}
            </p>
            <div className="shop-catalogue">
              <aside className="shop-filters">
                <h2>Refine collection</h2>
                <label>
                  Collection
                  <select
                    value={category}
                    onChange={(e) =>
                      (location.href = "/catalogue?category=" + e.target.value)
                    }
                  >
                    <option value="">All metals</option>
                    {categories.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Mint or refiner
                  <select
                    value={brand}
                    onChange={(e) => {
                      setBrand(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All makers</option>
                    {Object.entries(data?.facets.brand || {}).map(
                      ([name, n]) => (
                        <option key={name} value={name}>
                          {name} ({String(n)})
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="shop-check">
                  <input
                    type="checkbox"
                    checked={inStock}
                    onChange={(e) => {
                      setInStock(e.target.checked);
                      setPage(1);
                    }}
                  />{" "}
                  Available stock only
                </label>
                <p>
                  Product specifications are supplied demo data and have not
                  been independently verified.
                </p>
              </aside>
              <div>
                <div className="shop-toolbar">
                  <span>{data?.total ?? "…"} products</span>
                  <label>
                    Sort
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="featured">Featured</option>
                      <option value="newest">Newest year</option>
                      <option value="price_asc">Price: low to high</option>
                      <option value="price_desc">Price: high to low</option>
                    </select>
                  </label>
                  <label>
                    Quantity
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={qty}
                      onChange={(e) =>
                        setQty(
                          Math.max(1, Math.min(1000, Number(e.target.value))),
                        )
                      }
                    />
                  </label>
                  <label>
                    Per page
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(+e.target.value);
                        setPage(1);
                      }}
                    >
                      {[24, 48, 100].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {isSell ? (
                  <div
                    className="shop-table-wrap"
                    tabIndex={0}
                    role="region"
                    aria-label="Scrollable data table"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Indicative buy-back</th>
                          <th>Spot timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data?.items.map((p: any) => (
                          <tr key={p.id}>
                            <td>
                              <a href={`/products/${p.slug}`}>{p.name}</a>
                            </td>
                            <td>
                              {p.buybackPence
                                ? formatGBP(p.buybackPence)
                                : "Unavailable"}
                            </td>
                            <td>
                              {p.priceAt
                                ? new Date(p.priceAt).toLocaleString("en-GB")
                                : ""}
                              {p.stale ? " · Stale" : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="shop-grid catalogue-grid">
                    {data?.items.map((p: any) => (
                      <ProductCard key={p.id} p={p} onAdd={add} />
                    ))}
                  </div>
                )}
                <div className="shop-pagination">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    Page {page} of{" "}
                    {Math.max(1, Math.ceil((data?.total || 0) / pageSize))}
                  </span>
                  <button
                    disabled={page * pageSize >= (data?.total || 0)}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
        {isProduct && product && (
          <section className="shop-section">
            <p className="shop-eyebrow">
              <a href="/catalogue">COLLECTION</a> / {product.brand}
            </p>
            <div className="shop-product">
              <div className="shop-product-visual">
                <BullionIllustration large product={product} />
                <p>Original illustration · not a product photograph</p>
              </div>
              <div>
                <p className="shop-maker">
                  {product.brand} / {product.sku}
                </p>
                <h1>{product.name}</h1>
                <p className="shop-stock">
                  {product.available} available · fictional stock
                </p>
                <p className="shop-product-price">
                  {product.pricing
                    ? formatGBP(product.pricing.totalPence)
                    : "Price unavailable"}
                </p>
                <p>
                  For {qty} {qty === 1 ? "pack" : "packs"} ·{" "}
                  {product.pricing ? formatGBP(product.pricing.vatPence) : "—"}{" "}
                  demo VAT included
                </p>
                <p className="shop-price-time">
                  {product.source === "fixture" ? "SIMULATED spot" : "Spot"}:{" "}
                  {product.priceAt
                    ? new Date(product.priceAt).toLocaleString("en-GB")
                    : ""}{" "}
                  · Prices refresh every 30 seconds
                  {product.stale ? " · STALE — ordering unavailable" : ""}
                </p>
                <div className="shop-buy">
                  <label>
                    Quantity
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={qty}
                      onChange={(e) =>
                        setQty(Math.max(1, Math.min(1000, +e.target.value)))
                      }
                    />
                  </label>
                  <button
                    className="shop-button"
                    onClick={() => add(product)}
                    disabled={product.stale || product.available < qty}
                  >
                    Add to demo basket <ShoppingBag size={18} />
                  </button>
                </div>
                <table>
                  <caption>Quantity pricing, before VAT</caption>
                  <thead>
                    <tr>
                      <th>Quantity</th>
                      <th>Premium</th>
                      <th>Per pack</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.pricedTiers.map((t: any, i: number) => (
                      <tr key={i}>
                        <td>{product.tiers[i].minQuantity}+</td>
                        <td>{product.tiers[i].premiumBps / 100}%</td>
                        <td>{t ? formatGBP(t.unitPence) : "Unavailable"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="shop-buyback">
                  Indicative buy-back per pack{" "}
                  <strong>
                    {product.buybackPence
                      ? formatGBP(product.buybackPence)
                      : "Unavailable"}
                  </strong>
                </div>
              </div>
            </div>
            <div className="shop-specs">
              <h2>Product specifications</h2>
              <dl>
                {Object.entries({
                  Metal: product.metal,
                  Purity: `${product.fineness / 100}%`,
                  "Fine weight per pack": `${product.fine_weight_mg_per_pack / 1000}g`,
                  "Gross weight per item": `${product.gross_weight_mg_per_unit / 1000}g`,
                  "Items per pack": product.pack_quantity,
                  Diameter: product.diameter_mm
                    ? `${product.diameter_mm}mm`
                    : "Not specified",
                  Brand: product.brand,
                  Year: product.year || "Mixed / unspecified",
                  "UK legal tender": product.uk_legal_tender ? "Yes" : "No",
                }).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
              </dl>
              <p>
                Supplied demo specifications; verify with the mint before
                relying on them.
              </p>
            </div>
            <h2>You may also explore</h2>
            <div className="shop-grid">
              {product.related.map((p: any) => (
                <ProductCard key={p.id} p={p} onAdd={add} />
              ))}
            </div>
          </section>
        )}
        {isBasket && (
          <section className="shop-section shop-narrow">
            <p className="shop-eyebrow">YOUR COLLECTION</p>
            <h1>Demo basket</h1>
            <p>
              Prices remain live until you create a ten-minute checkout lock.
            </p>
            {basket.length === 0 ? (
              <p>
                Your basket is empty.{" "}
                <a href="/catalogue">Explore the collection →</a>
              </p>
            ) : (
              <>
                {basket.map((p: any) => (
                  <div className="shop-basket-line" key={p.id}>
                    <BullionIllustration product={p} />
                    <div>
                      <a href={`/products/${p.slug}`}>{p.name}</a>
                      <p>
                        {p.quantity} pack(s) ·{" "}
                        {p.pricing
                          ? formatGBP(p.pricing.totalPence)
                          : "Unavailable"}
                      </p>
                      <button
                        onClick={async () => {
                          await api(`/api/shop/basket/${p.id}`, {
                            method: "DELETE",
                            body: "{}",
                          });
                          await loadBasket();
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                <a className="shop-button" href="/checkout">
                  Continue to demo checkout <ArrowRight size={18} />
                </a>
              </>
            )}
          </section>
        )}
        {isAccount && (
          <section className="shop-section shop-narrow">
            <p className="shop-eyebrow">CUSTOMER SPACE</p>
            <h1>
              {customer?.id ? `Welcome, ${customer.name}` : "Your demo account"}
            </h1>
            {!customer?.id ? (
              <>
                <p>
                  Use a fictional customer to explore orders. No personal
                  information is required.
                </p>
                <button
                  className="shop-button"
                  onClick={demoLogin}
                  disabled={busy}
                >
                  Enter as demo customer
                </button>
              </>
            ) : (
              <>
                <p>Fictional account · no real purchases.</p>
                {holdings.length > 0 && (
                  <section>
                    <h2>Indicative holdings</h2>
                    {holdings.map((h) => (
                      <div className="admin-total-row" key={h.id}>
                        <span>
                          {h.name} × {h.quantity}
                          <br />
                          <small>
                            Paid {formatGBP(h.paidPence)} ·{" "}
                            {h.priceAt
                              ? new Date(h.priceAt).toLocaleString("en-GB")
                              : ""}{" "}
                            ·{" "}
                            {h.source === "fixture"
                              ? "Simulated"
                              : h.stale
                                ? "Stale"
                                : "Current"}
                          </small>
                        </span>
                        <strong>
                          {h.indicativeBuybackPence == null
                            ? "Unavailable"
                            : formatGBP(h.indicativeBuybackPence)}
                        </strong>
                      </div>
                    ))}
                    <p>
                      Indicative dealer buy-back value, before any inspection.
                      No guaranteed return.
                    </p>
                  </section>
                )}
                {orders.length === 0 ? (
                  <p>No demo orders yet.</p>
                ) : (
                  orders.map((o) => (
                    <article className="shop-order" key={o.id}>
                      <h2>Demo order {o.id.slice(0, 8)}</h2>
                      <p>
                        {o.status.replaceAll("_", " ")} ·{" "}
                        {new Date(o.created_at).toLocaleString("en-GB")}
                      </p>
                      <strong>{formatGBP(Number(o.total_pence))}</strong>
                      {o.lines?.map((l: any) => (
                        <p key={l.productId}>
                          {l.name} × {l.quantity}
                        </p>
                      ))}
                    </article>
                  ))
                )}
              </>
            )}
          </section>
        )}
        {isCheckout && (
          <section className="shop-section shop-narrow">
            <p className="shop-eyebrow">SIMULATED CHECKOUT</p>
            <h1>
              {confirmation
                ? "Your demo order is placed."
                : "Review your collection."}
            </h1>
            {confirmation ? (
              <>
                <p>
                  Order {confirmation.id}. Payment simulated. Nothing will be
                  charged or shipped.
                </p>
                <a className="shop-button" href="/account">
                  View your orders <ArrowRight size={18} />
                </a>
              </>
            ) : !customer?.id ? (
              <>
                <p>
                  Sign in as a fictional customer to continue. No personal or
                  payment details are needed.
                </p>
                <button
                  className="shop-button"
                  onClick={demoLogin}
                  disabled={busy}
                >
                  Enter as demo customer
                </button>
              </>
            ) : (
              <>
                <div className="shop-checkout-step">
                  <h2>01 / Customer & delivery</h2>
                  <p>
                    {customer.name}
                    <br />
                    Demo House, Example Street, London
                    <br />
                    Fictional address — no delivery will be made.
                  </p>
                  <p>Free insured UK delivery — simulated service only.</p>
                </div>
                <div className="shop-checkout-step">
                  <h2>02 / Simulated payment</h2>
                  <label>
                    <input type="radio" name="payment" defaultChecked /> Demo
                    bank transfer
                  </label>
                  <label>
                    <input type="radio" name="payment" /> Demo card payment — no
                    card fields
                  </label>
                </div>
                <div className="shop-checkout-step">
                  <h2>03 / Price lock & review</h2>
                  {!lock ? (
                    <button
                      className="shop-button"
                      disabled={busy}
                      onClick={beginCheckout}
                    >
                      Lock current prices for 10 minutes
                    </button>
                  ) : (
                    <>
                      <p>
                        Locked until{" "}
                        {new Date(lock.expiresAt).toLocaleTimeString("en-GB")}.
                      </p>
                      {lock.lines.map((l: any) => (
                        <p key={l.productId}>
                          {l.name} × {l.quantity}{" "}
                          <strong>{formatGBP(l.totalPence)}</strong>
                        </p>
                      ))}
                      <p>VAT: {formatGBP(lock.vatPence)}</p>
                      <h3>Total {formatGBP(lock.totalPence)}</h3>
                      <button
                        className="shop-button"
                        disabled={busy}
                        onClick={placeOrder}
                      >
                        {busy ? "Processing…" : "Place simulated order"}
                      </button>
                      <button onClick={beginCheckout} disabled={busy}>
                        Refresh expired lock
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        )}
        {path === "/guides" && (
          <section className="shop-section shop-narrow">
            <h1>Bullion guides</h1>
            <p>Coming soon in this demo.</p>
            <a href="/prices/xau">Explore the price charts →</a>
          </section>
        )}
      </main>
      <footer className="shop-footer">
        <div>
          <a className="shop-wordmark" href="/store">
            HADJ LAKEHAL<span>M E T A L S</span>
          </a>
          <p>A full-stack portfolio demonstration by Taha Hadj Lakehal.</p>
        </div>
        <div>
          <h2>Explore</h2>
          <a href="/catalogue">The collection</a>
          <a href="/prices/xau">Market prices</a>
          <a href="/sell-to-us">Indicative buy-back</a>
        </div>
        <div>
          <h2>Behind the store</h2>
          <a href="/desk">Dealer workspace</a>
          <a href="/admin">Admin dashboard</a>
          <a href="/account">Demo customer account</a>
        </div>
        <p className="shop-footer-note">
          Fictional inventory. Simulated payments. No shipping or real trading.
          Illustrations are original; no affiliation with the named mints or
          refiners. Market values are indicative.
        </p>
      </footer>
    </div>
  );
}
