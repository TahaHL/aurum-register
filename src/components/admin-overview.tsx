import { useState } from "react";
import { formatGBP } from "../../shared/pricing";
import "./admin-overview.css";
type Day = { revenuePence: number; orders: number };
type Product = {
  id: string;
  name: string;
  available: number;
  low_stock_threshold: number;
};
type Order = {
  id: string;
  status: string;
  customer_name: string;
  total_pence: number;
  created_at: string;
};
type Report = {
  role: string;
  from: string;
  to: string;
  summary: {
    revenuePence: number;
    orderCount: number;
    grossProfitPence: number | null;
    stockAtSpotPence: number | null;
  };
  daily: Record<string, Day>;
  dailyProfit?: Record<string, number | null>;
  byMetal: Record<string, number>;
  inventory: Product[];
  orders: Order[];
  reservations?: unknown[];
};
const money = (n: number | null | undefined) =>
  n == null ? "Unavailable" : formatGBP(Number(n));
const compact = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n / 100);
const names: Record<string, string> = {
  XAU: "Gold",
  XAG: "Silver",
  XPT: "Platinum",
  XPD: "Palladium",
};
export default function AdminOverview({
  data,
  navigate,
}: {
  data: Report;
  navigate: (tab: string) => void;
}) {
  const [metric, setMetric] = useState<"revenue" | "profit">("revenue");
  const owner = data.role === "owner",
    s = data.summary;
  const low = data.inventory.filter(
    (p) => p.available <= p.low_stock_threshold,
  );
  const pending = data.orders.filter((o) => o.status === "paid_simulated");
  const points: Array<{ date: string; value: number | null }> = [];
  for (
    let d = new Date(data.from.slice(0, 10) + "T00:00:00Z"),
      end = new Date(data.to);
    d <= end;
    d = new Date(+d + 86400000)
  ) {
    const date = d.toISOString().slice(0, 10);
    points.push({
      date,
      value:
        metric === "revenue"
          ? data.daily[date]?.revenuePence || 0
          : date in (data.dailyProfit || {})
            ? data.dailyProfit![date]
            : 0,
    });
  }
  const values = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  const min = Math.min(0, ...values),
    max = Math.max(100, ...values),
    span = max - min;
  const x = (i: number) => 60 + (i * 620) / Math.max(1, points.length - 1),
    y = (v: number) => 200 - ((v - min) / span) * 165;
  let path = "",
    connected = false;
  points.forEach((p, i) => {
    if (p.value === null) {
      connected = false;
      return;
    }
    path += `${connected ? "L" : "M"}${x(i)},${y(p.value)} `;
    connected = true;
  });
  const metalTotal = Object.values(data.byMetal).reduce((a, b) => a + b, 0);
  const [focus, setFocus] = useState<number | null>(null);
  const active =
    focus === null ? null : points[Math.min(focus, points.length - 1)];
  return (
    <div className="ops-overview">
      <div className="ops-metrics">
        {[
          [
            "Net revenue",
            money(s.revenuePence),
            "Excludes VAT and cancelled orders",
            "Orders",
          ],
          [
            "Orders",
            String(s.orderCount),
            "Simulated orders in this period",
            "Orders",
          ],
          ...(owner
            ? [
                [
                  "Gross profit",
                  money(s.grossProfitPence),
                  "Revenue less FIFO acquisition cost",
                  "Profit & loss",
                ],
                [
                  "Inventory at spot",
                  money(s.stockAtSpotPence),
                  "Current valuation · not sales revenue",
                  "Inventory",
                ],
              ]
            : [
                [
                  "Products",
                  String(data.inventory.length),
                  "Products in your inventory",
                  "Inventory",
                ],
              ]),
        ].map(([label, value, caption, target]) => (
          <button
            key={label}
            className="ops-metric"
            onClick={() => navigate(target)}
          >
            <span>
              {label}
              <span aria-hidden="true"> ↗</span>
            </span>
            <strong>{value}</strong>
            <small>{caption}</small>
          </button>
        ))}
      </div>
      <div className="ops-primary">
        <section className="ops-panel ops-trend">
          <div className="ops-panel-heading">
            <div>
              <h2>Trading performance</h2>
              <p>Daily totals for the selected period</p>
            </div>
            {owner && (
              <div className="ops-segment" aria-label="Chart metric">
                <button
                  aria-pressed={metric === "revenue"}
                  onClick={() => {
                    setMetric("revenue");
                    setFocus(null);
                  }}
                >
                  Revenue
                </button>
                <button
                  aria-pressed={metric === "profit"}
                  onClick={() => {
                    setMetric("profit");
                    setFocus(null);
                  }}
                >
                  Gross profit
                </button>
              </div>
            )}
          </div>
          {points.length ? (
            <>
              <svg
                className="ops-line-chart"
                viewBox="0 0 710 240"
                role="img"
                aria-label={`Daily ${metric === "revenue" ? "net revenue" : "gross profit"} in pounds. Exact values are in the chart data table.`}
              >
                {[0, 0.5, 1].map((t) => {
                  const value = min + span * t;
                  return (
                    <g key={t}>
                      <line
                        x1="60"
                        x2="680"
                        y1={y(value)}
                        y2={y(value)}
                        stroke="#e0e7ec"
                      />
                      <text x="50" y={y(value) + 4} textAnchor="end">
                        £{compact(value)}
                      </text>
                    </g>
                  );
                })}
                <line
                  x1="60"
                  x2="680"
                  y1={y(0)}
                  y2={y(0)}
                  stroke="#9baeb9"
                  strokeDasharray="4 4"
                />
                <path
                  d={path}
                  fill="none"
                  stroke={metric === "profit" ? "#93652d" : "#226985"}
                  strokeWidth="3"
                  strokeLinejoin="round"
                />
                {points.map(
                  (p, i) =>
                    p.value !== null && (
                      <circle
                        key={p.date}
                        cx={x(i)}
                        cy={y(p.value)}
                        r={focus === i ? 5 : 3}
                        fill={metric === "profit" ? "#93652d" : "#226985"}
                        onMouseEnter={() => setFocus(i)}
                      >
                        <title>
                          {p.date}: {money(p.value)}
                        </title>
                      </circle>
                    ),
                )}
                <text x="60" y="227">
                  {points[0].date.slice(5)}
                </text>
                <text x="680" y="227" textAnchor="end">
                  {points[points.length - 1].date.slice(5)}
                </text>
              </svg>
              <label className="ops-inspect">
                Inspect day{" "}
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, points.length - 1)}
                  value={focus ?? points.length - 1}
                  onChange={(e) => setFocus(+e.target.value)}
                />
                <output>
                  {active
                    ? `${active.date}: ${money(active.value)}`
                    : "Drag or use arrow keys to inspect"}
                </output>
              </label>
              <details className="ops-data">
                <summary>View chart data</summary>
                <div tabIndex={0} role="region" aria-label="Daily chart values">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>
                          {metric === "revenue"
                            ? "Net revenue"
                            : "Gross profit"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {points.map((p) => (
                        <tr key={p.date}>
                          <td>{p.date}</td>
                          <td>{money(p.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          ) : (
            <p>No observations in this period.</p>
          )}
        </section>
        <section className="ops-panel ops-attention">
          <h2>Attention needed</h2>
          <p>Orders: selected period · stock: current</p>
          <button onClick={() => navigate("Orders")}>
            <span>
              <strong>{pending.length}</strong> orders to dispatch
            </span>
            <span aria-hidden="true">→</span>
          </button>
          <button onClick={() => navigate("Inventory")}>
            <span>
              <strong>{low.length}</strong> products running low
            </span>
            <span aria-hidden="true">→</span>
          </button>
          <a href="/desk">
            <span>
              <strong>{data.reservations?.length || 0}</strong> open dealer
              holds
            </span>
            <span aria-hidden="true">→</span>
          </a>
          <div className="ops-shortcuts">
            <h3>Quick actions</h3>
            <button onClick={() => navigate("Inventory")}>
              Receive / correct stock ↗
            </button>
            <button onClick={() => navigate("Products")}>
              Manage product pricing ↗
            </button>
          </div>
        </section>
      </div>
      <div className="ops-secondary">
        <section className="ops-panel">
          <div className="ops-panel-heading">
            <div>
              <h2>Sales by metal</h2>
              <p>Share of net revenue</p>
            </div>
            <button
              className="ops-text-link"
              onClick={() => navigate(owner ? "Profit & loss" : "Orders")}
            >
              View report →
            </button>
          </div>
          {Object.entries(names).map(([metal, name]) => {
            const value = data.byMetal[metal] || 0,
              share = metalTotal ? (value / metalTotal) * 100 : 0;
            return (
              <div className="ops-metal" key={metal}>
                <div>
                  <span>{name}</span>
                  <strong>
                    {money(value)} <small>{share.toFixed(1)}%</small>
                  </strong>
                </div>
                <div className="ops-track">
                  <span style={{ width: `${share}%` }} />
                </div>
              </div>
            );
          })}
        </section>
        <section className="ops-panel">
          <div className="ops-panel-heading">
            <div>
              <h2>Recent orders</h2>
              <p>Latest in the selected period</p>
            </div>
            <button
              className="ops-text-link"
              onClick={() => navigate("Orders")}
            >
              All orders →
            </button>
          </div>
          {data.orders.slice(0, 5).map((o) => (
            <button
              className="ops-order"
              onClick={() => navigate("Orders")}
              key={o.id}
            >
              <span>
                <strong>#{o.id.slice(0, 8)}</strong>
                <small>
                  {new Date(o.created_at).toLocaleDateString("en-GB")}
                </small>
              </span>
              <span>
                <strong>{money(o.total_pence)}</strong>
                <small>{o.status.replaceAll("_", " ")}</small>
              </span>
            </button>
          ))}
          {!data.orders.length && <p>No orders in this period.</p>}
        </section>
      </div>
    </div>
  );
}
