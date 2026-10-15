import AdminOverview from "./components/admin-overview";
import { useEffect, useState, useRef } from "react";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { api } from "./api";
import { formatGBP } from "../shared/pricing";
import "./store.css";
const money = (n: number | null | undefined) =>
  n == null ? "Unverified" : formatGBP(Number(n));
export default function StoreAdmin() {
  const receiptRequest = useRef(crypto.randomUUID());
  const [tab, setTab] = useState("Overview"),
    [days, setDays] = useState(30),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [filter, setFilter] = useState(""),
    [customers, setCustomers] = useState<any[]>([]),
    [activity, setActivity] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [message, setMessage] = useState("");
  const [fromDate, setFromDate] = useState(""),
    [toDate, setToDate] = useState(""),
    [postage, setPostage] = useState(7.5);
  const reportQuery = new URLSearchParams({
    days: String(days),
    expensePence: String(Math.round(postage * 100)),
    ...(fromDate ? { from: fromDate } : {}),
    ...(toDate ? { to: toDate } : {}),
  }).toString();
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const load = () =>
    api<any>(`/api/admin/store?${reportQuery}`)
      .then((value) => {
        setData(value);
        setUpdatedAt(new Date());
        setError("");
      })
      .catch((e) => setError(String(e)));
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => clearInterval(timer);
  }, [days, fromDate, toDate, postage]);
  useEffect(() => {
    if (tab === "Customers")
      void api<any[]>("/api/admin/customers")
        .then(setCustomers)
        .catch((e) => setError(String(e)));
    if (tab === "Activity")
      void api<any[]>("/api/admin/activity")
        .then(setActivity)
        .catch((e) => setError(String(e)));
    setSelected(null);
    setFilter("");
  }, [tab]);
  async function changeOrder(id: string, status: string) {
    try {
      await api(`/api/admin/orders/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await load();
      setMessage("Demo order updated.");
    } catch (e) {
      setError(String(e));
    }
  }
  const owner = data?.role === "owner",
    s = data?.summary,
    items =
      data?.inventory?.filter((p: any) =>
        p.name.toLowerCase().includes(filter.toLowerCase()),
      ) || [];
  return (
    <div className="hlm-shop admin-shop">
      <header className="admin-header">
        <a
          className="shop-wordmark"
          href="/admin"
          aria-label="Hadj Lakehal Metals admin home"
        >
          HADJ LAKEHAL<span>M E T A L S</span>
        </a>
        <span>STORE OPERATIONS</span>
        <a href="/store">
          View storefront <ArrowUpRight size={16} />
        </a>
      </header>
      <div className="admin-layout">
        <nav className="admin-nav" aria-label="Admin sections">
          {[
            "Overview",
            "Orders",
            "Inventory",
            "Products",
            ...(owner ? ["Profit & loss"] : []),
            "Customers",
            "Activity",
          ].map((name) => (
            <button
              key={name}
              aria-current={tab === name ? "page" : undefined}
              onClick={() => setTab(name)}
            >
              {name}
              <ArrowRight size={14} />
            </button>
          ))}
          <a href="/desk">Dealer desk ↗</a>
          <a href="/store">Customer store ↗</a>
        </nav>
        <main className="admin-main">
          <div className="admin-title">
            <div>
              <p className="shop-eyebrow">
                HLM / {data?.role || "SIGN IN REQUIRED"}
              </p>
              <h1>{tab}</h1>
            </div>
            <label>
              Period
              <select
                value={days}
                onChange={(e) => {
                  setDays(+e.target.value);
                  setFromDate("");
                  setToDate("");
                }}
              >
                {[1, 7, 30, 90].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "Last 24 hours" : `Last ${n} days`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <details className="admin-report-options">
            <summary>Custom dates & report assumptions</summary>
            <div className="admin-date-range">
              <label>
                From
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </label>
              {owner && (
                <label>
                  Assumed postage per order (£)
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    step="0.01"
                    value={postage}
                    onChange={(e) =>
                      setPostage(
                        Math.max(0, Math.min(1000, Number(e.target.value))),
                      )
                    }
                  />
                </label>
              )}
            </div>
          </details>
          <p className="admin-demo">
            Includes simulated demo orders. No real payments or trading.
          </p>
          {error && (
            <div className="shop-message" role="alert">
              {error}{" "}
              {!data && (
                <a href="/desk">Sign in to the dealer workspace first →</a>
              )}
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          {data && (
            <div className="admin-refresh">
              <span>
                {updatedAt
                  ? `Updated ${updatedAt.toLocaleTimeString("en-GB")}`
                  : "Loading"}{" "}
                · refreshes every 30s
              </span>
              <button onClick={() => void load()}>Refresh data</button>
            </div>
          )}
          {message && <p role="status">{message}</p>}
          {data && (tab === "Overview" || tab === "Profit & loss") && (
            <>
              {tab === "Profit & loss" && (
                <div className="admin-kpis">
                  {Object.entries({
                    "Revenue ex VAT": money(s.revenuePence),
                    "VAT collected": money(s.vatPence),
                    "Demo orders": String(s.orderCount),
                    ...(owner
                      ? {
                          "Gross profit": money(s.grossProfitPence),
                          "Gross margin":
                            s.marginPercent == null
                              ? "Unverified"
                              : s.marginPercent.toFixed(2) + "%",
                          "Stock at cost": money(s.stockAtCostPence),
                          "Stock at spot": money(s.stockAtSpotPence),
                          "Unrealised gain / loss": money(s.unrealisedPence),
                        }
                      : {}),
                  }).map(([label, value]) => (
                    <article key={label}>
                      <p>{label}</p>
                      <strong>{value}</strong>
                    </article>
                  ))}
                </div>
              )}
              {owner && (s.unknownCosts > 0 || s.stockAtCostPence === null) && (
                <p className="admin-cost-note">
                  Some opening lots have no verified acquisition cost. Profit
                  and stock-at-cost totals are withheld until those costs are
                  available.
                </p>
              )}
              {tab === "Overview" ? (
                <AdminOverview data={data} navigate={setTab} />
              ) : (
                <>
                  <section className="admin-pnl">
                    <h2>Realised trading result</h2>
                    {Object.entries({
                      "Net revenue": s.revenuePence,
                      "Cost of goods sold (FIFO)": s.cogsPence,
                      "Gross profit": s.grossProfitPence,
                      "Assumed demo postage": s.expensesPence,
                      "Net result": s.netPence,
                      "VAT collected (excluded from revenue)": s.vatPence,
                    }).map(([name, value]: any) => (
                      <div className="admin-total-row" key={name}>
                        <span>{name}</span>
                        <strong>{money(value)}</strong>
                      </div>
                    ))}
                    <a
                      className="shop-button"
                      href={`/api/admin/pnl.csv?${reportQuery}`}
                    >
                      Export CSV <ArrowUpRight size={16} />
                    </a>
                  </section>
                  {Object.entries(data.groups || {}).map(
                    ([dimension, rows]: any) => (
                      <section key={dimension}>
                        <h2>Trading result by {dimension}</h2>
                        <div
                          className="shop-table-wrap"
                          tabIndex={0}
                          role="region"
                          aria-label={`Profit by ${dimension}`}
                        >
                          <table>
                            <thead>
                              <tr>
                                <th>{dimension}</th>
                                <th>Net revenue</th>
                                <th>FIFO cost</th>
                                <th>Gross profit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(rows).map(
                                ([name, values]: any) => (
                                  <tr key={name}>
                                    <td>{name}</td>
                                    <td>{money(values.revenuePence)}</td>
                                    <td>{money(values.cogsPence)}</td>
                                    <td>{money(values.grossProfitPence)}</td>
                                  </tr>
                                ),
                              )}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    ),
                  )}
                  <h2>Revenue by product</h2>
                  {Object.entries(data.byProduct).map(([name, value]: any) => (
                    <div className="admin-total-row" key={name}>
                      <span>{name}</span>
                      <strong>{money(value)}</strong>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
          {data && tab === "Orders" && (
            <>
              <label className="admin-search">
                Search customer, ID, status or metal
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
              <div
                className="shop-table-wrap"
                tabIndex={0}
                role="region"
                aria-label="Scrollable data table"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Demo order</th>
                      <th>Customer</th>
                      <th>Status</th>
                      <th>Total incl. VAT</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders
                      .filter((o: any) =>
                        `${o.id} ${o.customer_name} ${o.status} ${o.lines.map((l: any) => l.metal).join(" ")}`
                          .toLowerCase()
                          .includes(filter.toLowerCase()),
                      )
                      .map((o: any) => (
                        <tr key={o.id}>
                          <td>
                            <button onClick={() => setSelected(o)}>
                              {o.id.slice(0, 8)}
                            </button>
                            <small>
                              {new Date(o.created_at).toLocaleDateString(
                                "en-GB",
                              )}
                            </small>
                          </td>
                          <td>{o.customer_name}</td>
                          <td>{o.status.replaceAll("_", " ")}</td>
                          <td>{money(o.total_pence)}</td>
                          <td>
                            {o.status === "paid_simulated" && (
                              <>
                                <button
                                  onClick={() =>
                                    changeOrder(o.id, "dispatched")
                                  }
                                >
                                  Dispatch
                                </button>
                                {owner && (
                                  <button
                                    onClick={() =>
                                      changeOrder(o.id, "cancelled")
                                    }
                                  >
                                    Cancel & restore stock
                                  </button>
                                )}
                              </>
                            )}
                            {o.status === "dispatched" && (
                              <button
                                onClick={() => changeOrder(o.id, "delivered")}
                              >
                                Mark delivered
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {selected && (
                <section className="admin-editor">
                  <h2>Order {selected.id.slice(0, 8)}</h2>
                  {owner && (
                    <>
                      <p>
                        FIFO cost {money(selected.cogsPence)} · Gross profit{" "}
                        {money(selected.grossProfitPence)}
                      </p>
                      <div
                        className="shop-table-wrap"
                        tabIndex={0}
                        role="region"
                        aria-label="Order FIFO allocations"
                      >
                        <table>
                          <thead>
                            <tr>
                              <th>Allocated lot</th>
                              <th>Quantity</th>
                              <th>Unit cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(selected.allocations || []).map((a: any) => (
                              <tr key={a.order_line_id + a.lot_id}>
                                <td>
                                  {data.costLots.find(
                                    (l: any) => l.id === a.lot_id,
                                  )?.sku || a.lot_id}
                                </td>
                                <td>{a.quantity}</td>
                                <td>{money(a.unit_cost_pence)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {selected.lines.map((l: any) => (
                    <p key={l.productId}>
                      {l.name} × {l.quantity} — {money(l.totalPence)}
                      <br />
                      <small>
                        Spot {l.spot} GBP/oz · {l.source} ·{" "}
                        {new Date(l.priceAt).toLocaleString("en-GB")}
                      </small>
                    </p>
                  ))}
                </section>
              )}
            </>
          )}
          {data && (tab === "Inventory" || tab === "Products") && (
            <>
              <label className="admin-search">
                Search products
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
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
                      <th>Available</th>
                      <th>Reserved</th>
                      <th>Published</th>
                      {owner && <th>Manage</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p: any) => (
                      <tr key={p.id}>
                        <td>
                          {p.name}
                          <small>{p.sku}</small>
                        </td>
                        <td>{p.available}</td>
                        <td>{p.reserved}</td>
                        <td>{p.published ? "Yes" : "No"}</td>
                        {owner && (
                          <td>
                            <button onClick={() => setSelected(p)}>
                              {tab === "Products"
                                ? "Edit pricing"
                                : "View lots / receive"}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {owner && selected && (
                <section className="admin-editor" key={selected.id}>
                  <h2>{selected.name}</h2>
                  {tab === "Inventory" && (
                    <div className="admin-kpis">
                      {Object.entries({
                        "Average unit cost": selected.averageCostPence,
                        "Stock at cost": selected.stockAtCostPence,
                        "Stock at spot": selected.stockAtSpotPence,
                        "Unrealised gain / loss": selected.unrealisedPence,
                      }).map(([k, v]: any) => (
                        <article key={k}>
                          <p>{k}</p>
                          <strong>{money(v)}</strong>
                        </article>
                      ))}
                    </div>
                  )}
                  {tab === "Products" ? (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          const f = new FormData(e.currentTarget);
                          await api(`/api/admin/products/${selected.id}`, {
                            method: "POST",
                            body: JSON.stringify({
                              tiers: selected.tiers,
                              buybackDiscountBps: Math.round(
                                Number(f.get("discount")) * 100,
                              ),
                              published: f.get("published") === "on",
                              tags: f.getAll("tags"),
                              lowStockThreshold: Number(f.get("threshold")),
                            }),
                          });
                          await load();
                          setMessage("Product pricing saved.");
                        } catch (e) {
                          setError(String(e));
                        }
                      }}
                    >
                      <fieldset className="admin-tier-editor">
                        <legend>Quantity price breaks</legend>
                        <p>
                          Premiums must stay the same or decrease as quantity
                          increases.
                        </p>
                        {selected.tiers.map((tier: any, index: number) => (
                          <div key={index}>
                            <label>
                              Minimum packs
                              <input
                                type="number"
                                min="1"
                                max="1000"
                                required
                                value={tier.minQuantity}
                                onChange={(e) =>
                                  setSelected({
                                    ...selected,
                                    tiers: selected.tiers.map(
                                      (t: any, i: number) =>
                                        i === index
                                          ? {
                                              ...t,
                                              minQuantity: +e.target.value,
                                            }
                                          : t,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label>
                              Premium (%)
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                required
                                value={tier.premiumBps / 100}
                                onChange={(e) =>
                                  setSelected({
                                    ...selected,
                                    tiers: selected.tiers.map(
                                      (t: any, i: number) =>
                                        i === index
                                          ? {
                                              ...t,
                                              premiumBps: Math.round(
                                                +e.target.value * 100,
                                              ),
                                            }
                                          : t,
                                    ),
                                  })
                                }
                              />
                            </label>
                            {index > 0 && (
                              <button
                                type="button"
                                aria-label={`Remove price break ${index + 1}`}
                                onClick={() =>
                                  setSelected({
                                    ...selected,
                                    tiers: selected.tiers.filter(
                                      (_: any, i: number) => i !== index,
                                    ),
                                  })
                                }
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setSelected({
                              ...selected,
                              tiers: [
                                ...selected.tiers,
                                {
                                  minQuantity: Math.min(
                                    1000,
                                    selected.tiers.at(-1).minQuantity + 1,
                                  ),
                                  premiumBps: selected.tiers.at(-1).premiumBps,
                                },
                              ],
                            })
                          }
                        >
                          Add quantity break
                        </button>
                      </fieldset>
                      <label>
                        Buy-back discount (%)
                        <input
                          name="discount"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          defaultValue={selected.buyback_discount_bps / 100}
                        />
                      </label>
                      <label>
                        Low-stock threshold
                        <input
                          name="threshold"
                          type="number"
                          min="0"
                          defaultValue={selected.low_stock_threshold}
                        />
                      </label>
                      <fieldset>
                        <legend>Product labels</legend>
                        {["best-seller", "new-release", "pre-owned"].map(
                          (tag) => (
                            <label key={tag}>
                              <input
                                name="tags"
                                type="checkbox"
                                value={tag}
                                defaultChecked={selected.tags.includes(tag)}
                              />
                              {tag.replaceAll("-", " ")}
                            </label>
                          ),
                        )}
                      </fieldset>
                      <label>
                        <input
                          name="published"
                          type="checkbox"
                          defaultChecked={selected.published}
                        />{" "}
                        Published
                      </label>
                      <button className="shop-button">Save product</button>
                    </form>
                  ) : (
                    <>
                      <table>
                        <thead>
                          <tr>
                            <th>Lot / received</th>
                            <th>On hand</th>
                            <th>Unit cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.costLots
                            .filter((l: any) => l.product_id === selected.id)
                            .map((l: any) => (
                              <tr key={l.id}>
                                <td>
                                  {l.sku}
                                  <small>
                                    {new Date(l.acquired_at).toLocaleDateString(
                                      "en-GB",
                                    )}
                                  </small>
                                </td>
                                <td>{l.total_units}</td>
                                <td>{money(l.unit_cost_pence)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          try {
                            await api("/api/admin/receive", {
                              method: "POST",
                              body: JSON.stringify({
                                productId: selected.id,
                                quantity: Number(f.get("quantity")),
                                unitCostPence: Math.round(
                                  Number(f.get("cost")) * 100,
                                ),
                                supplierReference: String(f.get("reference")),
                                requestId: receiptRequest.current,
                              }),
                            });
                            await load();
                            receiptRequest.current = crypto.randomUUID();
                            setMessage("Fictional stock received and audited.");
                          } catch (e) {
                            setError(String(e));
                          }
                        }}
                      >
                        <h3>Receive fictional stock</h3>
                        <label>
                          Quantity
                          <input
                            name="quantity"
                            type="number"
                            min="1"
                            max="10000"
                            required
                          />
                        </label>
                        <label>
                          Cost per pack (£)
                          <input
                            name="cost"
                            type="number"
                            min="0"
                            step="0.01"
                            required
                          />
                        </label>
                        <label>
                          Supplier reference
                          <input
                            name="reference"
                            minLength={3}
                            maxLength={120}
                            required
                          />
                        </label>
                        <button className="shop-button">Receive stock</button>
                      </form>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          try {
                            await api(`/api/inventory/${f.get("lot")}/adjust`, {
                              method: "POST",
                              body: JSON.stringify({
                                delta: Number(f.get("delta")),
                                reason: String(f.get("reason")),
                                requestId: receiptRequest.current,
                              }),
                            });
                            receiptRequest.current = crypto.randomUUID();
                            await load();
                            setMessage("Stock correction recorded.");
                          } catch (e) {
                            setError(String(e));
                          }
                        }}
                      >
                        <h3>Correct a lot</h3>
                        <label>
                          Lot
                          <select name="lot">
                            {data.costLots
                              .filter((l: any) => l.product_id === selected.id)
                              .map((l: any) => (
                                <option key={l.id} value={l.id}>
                                  {l.sku}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Units to add or remove
                          <input
                            name="delta"
                            type="number"
                            min="-10000"
                            max="10000"
                            required
                          />
                        </label>
                        <label>
                          Reason
                          <input
                            name="reason"
                            minLength={5}
                            maxLength={300}
                            required
                          />
                        </label>
                        <button className="shop-button">
                          Record correction
                        </button>
                      </form>
                    </>
                  )}
                </section>
              )}
            </>
          )}
          {tab === "Customers" && (
            <div
              className="shop-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Scrollable data table"
            >
              <table>
                <thead>
                  <tr>
                    <th>Fictional customer</th>
                    <th>Orders</th>
                    <th>Lifetime value</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.orders}</td>
                      <td>{money(c.lifetime_pence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tab === "Activity" && (
            <>
              <label className="admin-search">
                Filter event type
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
              <table>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {activity
                    .filter((a) => a.type.includes(filter))
                    .map((a) => (
                      <tr key={a.id}>
                        <td>
                          {a.type}
                          {owner && a.details && (
                            <details>
                              <summary>Event details</summary>
                              <dl>
                                {Object.entries(a.details).map(([k, v]) => (
                                  <div key={k}>
                                    <dt>{k.replace(/([A-Z])/g, " $1")}</dt>
                                    <dd>
                                      {typeof v === "object"
                                        ? JSON.stringify(v)
                                        : String(v)}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            </details>
                          )}
                        </td>
                        <td>
                          {new Date(a.created_at).toLocaleString("en-GB")}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
