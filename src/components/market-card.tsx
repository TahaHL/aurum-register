import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  Download,
  RefreshCw,
} from "lucide-react";
import type {
  PriceHistory,
  PriceRange,
  PriceSnapshot,
  ChartObservation,
} from "../../shared/types";
import {
  chartSummary,
  rangeStart,
  unitPrice,
  type PriceUnit,
} from "../../shared/chart";
import { api } from "../api";

const money = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
const timestamp = (value: string, seconds = false) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
  }).format(new Date(value));
const ranges: [PriceRange, string][] = [
  ["1h", "Live"],
  ["1d", "1 day"],
  ["7d", "7 days"],
  ["3m", "3 months"],
  ["6m", "6 months"],
  ["1y", "1 year"],
  ["2y", "2 years"],
  ["3y", "3 years"],
  ["5y", "5 years"],
  ["10y", "10 years"],
  ["all", "All time"],
];

export default function MarketCard({
  snapshot,
  stale,
  connected,
  refreshing,
  error,
  onRefresh,
}: {
  snapshot: PriceSnapshot | null | undefined;
  stale: boolean;
  connected: boolean;
  refreshing: boolean;
  error: string | null | undefined;
  onRefresh: () => void;
}) {
  const [range, setRange] = useState<PriceRange>("1y"),
    [unit, setUnit] = useState<PriceUnit>("oz");
  const [history, setHistory] = useState<PriceHistory | null>(null),
    [historyError, setHistoryError] = useState("");
  const [loading, setLoading] = useState(true),
    [hover, setHover] = useState<number | null>(null),
    [table, setTable] = useState(false);
  const [width, setWidth] = useState(800);
  const container = useRef<HTMLDivElement>(null),
    gradient = useId().replace(/:/g, "");
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, entry.contentRect.width)),
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setHistory(null);
    setHover(null);
    async function load() {
      try {
        const data = await api<PriceHistory>(
          "/api/price/history?range=" + range,
        );
        if (active) {
          setHistory(data);
          setHistoryError("");
        }
      } catch (e) {
        if (active)
          setHistoryError(
            e instanceof Error ? e.message : "Price history is unavailable.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [range]);
  const cutoff = rangeStart(range, Date.now());
  const merged = new Map(
    (history?.source === "frankfurter" ||
    !snapshot ||
    history?.source === snapshot.source
      ? history?.points || []
      : []
    ).map((point) => [point.providerAt, point]),
  );
  if (
    snapshot &&
    history?.source !== "frankfurter" &&
    Date.parse(snapshot.providerAt) >= cutoff
  )
    merged.set(snapshot.providerAt, snapshot);
  const points = [...merged.values()]
    .filter(
      (point) =>
        history?.source === "frankfurter" ||
        Date.parse(point.providerAt) >= cutoff,
    )
    .sort((a, b) => Date.parse(a.providerAt) - Date.parse(b.providerAt));
  const summary = chartSummary(points, unit),
    current =
      history?.source === "frankfurter"
        ? (summary?.last ?? null)
        : snapshot
          ? unitPrice(snapshot.pricePerOunceGBP, unit)
          : null;
  const activeIndex =
      hover === null ? null : Math.min(hover, points.length - 1),
    active = activeIndex === null ? null : points[activeIndex];
  const height = width < 450 ? 280 : 320,
    left = 16,
    right = width - 104,
    top = 26,
    bottom = height - 42;
  const minTime = points.length ? Date.parse(points[0].providerAt) : cutoff;
  const maxTime =
    points.length > 1 ? Date.parse(points.at(-1)!.providerAt) : minTime + 60000;
  const low = summary?.low ?? 0,
    high = summary?.high ?? 1,
    padding = Math.max((high - low) * 0.18, high * 0.0003, 0.005);
  const yMin = Math.max(0, low - padding),
    yMax = high + padding;
  const x = (date: string) =>
    left +
    ((Date.parse(date) - minTime) / Math.max(1, maxTime - minTime)) *
      (right - left);
  const y = (value: string) =>
    bottom - ((unitPrice(value, unit) - yMin) / (yMax - yMin)) * (bottom - top);
  const paths: string[] = [],
    groups: ChartObservation[][] = [];
  for (const point of points) {
    const previous = groups.at(-1)?.at(-1);
    const gap =
      previous &&
      (history?.gaps || []).some(
        (gap) =>
          Date.parse(gap.from) >= Date.parse(previous.providerAt) &&
          Date.parse(gap.to) <= Date.parse(point.providerAt),
      );
    if (!previous || gap) groups.push([point]);
    else groups.at(-1)!.push(point);
  }
  for (const group of groups)
    paths.push(
      group
        .map(
          (point, index) =>
            (index ? "L" : "M") +
            x(point.providerAt).toFixed(2) +
            "," +
            y(point.pricePerOunceGBP).toFixed(2),
        )
        .join(" "),
    );
  function exportCsv() {
    const rows = [
      "provider_timestamp,price_gbp,unit,source",
      ...points.map((point) =>
        [
          point.providerAt,
          unitPrice(point.pricePerOunceGBP, unit).toFixed(6),
          unit,
          point.source,
        ].join(","),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "quoteledger-gold-" + range + "-" + unit + ".csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="market-card" aria-labelledby="gold-chart-heading">
      <div className="market-heading">
        <div className="metal-heading">
          <span className="metal-symbol">
            <span aria-hidden="true" className="metal-ingot" />
          </span>
          <div>
            <p className="eyebrow">
              {history?.source === "frankfurter"
                ? "XAU / GBP · REFERENCE"
                : "XAU / GBP · SPOT"}
            </p>
            <h2 id="gold-chart-heading">Gold price</h2>
          </div>
        </div>
        <span className={"feed-badge " + (stale ? "stale" : "")}>
          <i />
          {history?.source === "frankfurter"
            ? "Daily reference"
            : stale
              ? "Price delayed"
              : (snapshot?.source || history?.source) === "fixture"
                ? "Simulated feed"
                : "Live provider"}
        </span>
      </div>
      <div className="market-main">
        <div>
          {history?.source === "frankfurter" && <p className="reference-price-label">Daily reference price · not the live quote price</p>}
          <p className="market-price">
            {current === null ? "–" : money(current)}
            <small>
              {" "}
              / {unit === "oz" ? "troy oz" : unit === "g" ? "gram" : "kg"}
            </small>
          </p>
          <p
            className={
              "market-change " +
              ((summary?.change || 0) < 0 ? "negative" : "positive")
            }
          >
            {points.length > 1 && summary ? (
              <>
                {summary.change < 0 ? (
                  <ArrowDownRight size={17} />
                ) : (
                  <ArrowUpRight size={17} />
                )}
                {summary.change >= 0 ? "+" : "−"}
                {money(Math.abs(summary.change))} (
                {summary.percent >= 0 ? "+" : ""}
                {summary.percent.toFixed(2)}%)
                <span>
                  {history?.source === "frankfurter"
                    ? "over reference period"
                    : "over recorded period"}
                </span>
              </>
            ) : (
              <span>Collecting price observations</span>
            )}
          </p>
        </div>
        <div className="market-high-low">
          <span>
            Period high<strong>{summary ? money(summary.high) : "–"}</strong>
          </span>
          <span>
            Period low<strong>{summary ? money(summary.low) : "–"}</strong>
          </span>
        </div>
      </div>
      {stale && (
        <div className="stale-banner" role="status">
          <Clock3 size={16} />
          <span>
            Price feed delayed.{" "}
            {snapshot
              ? "Last update " + timestamp(snapshot.providerAt, true) + ". "
              : ""}
            Quotes are paused.
          </span>
        </div>
      )}
      <div className="chart-toolbar">
        <div className="chart-periods" role="group" aria-label="Chart period">
          {ranges.map(([value, label]) => (
            <button
              key={value}
              aria-label={label}
              aria-pressed={range === value}
              onClick={() => setRange(value)}
            >
              {value === "1h"
                ? "Live"
                : value === "all"
                  ? "All"
                  : value === "7d"
                    ? "1W"
                    : value.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="chart-selectors">
          <span className="chart-currency">GBP £</span>
          <label className="sr-only" htmlFor="chart-unit">
            Chart weight unit
          </label>
          <select
            id="chart-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value as PriceUnit)}
          >
            <option value="oz">Troy ounce</option>
            <option value="g">Gram</option>
            <option value="kg">Kilogram</option>
          </select>
          <button
            className="chart-download"
            onClick={exportCsv}
            disabled={!points.length}
            aria-label="Download chart observations as CSV"
            title="Download observations"
          >
            <Download size={17} />
          </button>
        </div>
      </div>
      <div
        className="chart-plot"
        ref={container}
        tabIndex={0}
        role="group"
        aria-label="Gold price chart. Use left and right arrow keys to inspect observations."
        onMouseLeave={() => setHover(null)}
        onKeyDown={(event) => {
          if (
            ["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(
              event.key,
            )
          ) {
            event.preventDefault();
            setHover(
              event.key === "Escape"
                ? null
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? points.length - 1
                    : Math.max(
                        0,
                        Math.min(
                          points.length - 1,
                          (hover ?? points.length - 1) +
                            (event.key === "ArrowLeft" ? -1 : 1),
                        ),
                      ),
            );
          }
        }}
      >
        <svg
          width="100%"
          height={height}
          viewBox={"0 0 " + width + " " + height}
          role="img"
          aria-label={
            "Gold price in GBP per " +
            unit +
            ". " +
            points.length +
            " plotted observations." +
            (summary
              ? " High " +
                money(summary.high) +
                ", low " +
                money(summary.low) +
                "."
              : "")
          }
          onPointerMove={(event) => {
            if (!points.length) return;
            const rect = event.currentTarget.getBoundingClientRect(),
              desired =
                minTime +
                ((((event.clientX - rect.left) / rect.width) * width - left) /
                  (right - left)) *
                  (maxTime - minTime);
            let nearest = 0;
            for (let i = 1; i < points.length; i++)
              if (
                Math.abs(Date.parse(points[i].providerAt) - desired) <
                Math.abs(Date.parse(points[nearest].providerAt) - desired)
              )
                nearest = i;
            setHover(nearest);
          }}
        >
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity=".22" />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {Array.from({ length: 5 }, (_, index) => {
            const yPos = top + ((bottom - top) * index) / 4,
              value = yMax - ((yMax - yMin) * index) / 4;
            return (
              <g key={index}>
                <line
                  x1={left}
                  x2={right}
                  y1={yPos}
                  y2={yPos}
                  stroke="var(--line)"
                  strokeDasharray="3 4"
                />
                <text
                  x={width - 2}
                  textAnchor="end"
                  y={yPos + 4}
                  className="chart-axis"
                >
                  {summary ? money(value) : "–"}
                </text>
              </g>
            );
          })}
          {points.length > 0 &&
            Array.from({ length: width < 450 ? 3 : 5 }, (_, index) => {
              const count = width < 450 ? 2 : 4,
                ratio = index / count,
                instant = minTime + (maxTime - minTime) * ratio;
              return (
                <g key={index}>
                  <line
                    x1={left + (right - left) * ratio}
                    x2={left + (right - left) * ratio}
                    y1={top}
                    y2={bottom}
                    stroke="none"
                  />
                  <text
                    x={left + (right - left) * ratio}
                    y={bottom + 26}
                    textAnchor={
                      index === 0 ? "start" : index === count ? "end" : "middle"
                    }
                    className="chart-axis"
                  >
                    {new Intl.DateTimeFormat("en-GB", {
                      timeZone: "Europe/London",
                      ...(maxTime - minTime > 3 * 365 * 86400000
                        ? { year: "numeric" as const }
                        : maxTime - minTime > 86400000
                          ? { day: "2-digit", month: "short" }
                          : { hour: "2-digit", minute: "2-digit" }),
                    }).format(new Date(instant))}
                  </text>
                </g>
              );
            })}
          {points.length > 1 && (
            <g>
              <line
                x1={left}
                x2={right}
                y1={y(points[0].pricePerOunceGBP)}
                y2={y(points[0].pricePerOunceGBP)}
                stroke="var(--text-muted)"
                strokeDasharray="4 4"
              />
              <text
                x={left + 4}
                y={Math.max(top + 14, y(points[0].pricePerOunceGBP) - 8)}
                className="chart-axis"
              >
                Open {money(unitPrice(points[0].pricePerOunceGBP, unit))}
              </text>
            </g>
          )}
          {paths.map((path, index) => (
            <g key={index}>
              <path
                d={
                  path +
                  " L" +
                  x(groups[index].at(-1)!.providerAt) +
                  "," +
                  bottom +
                  " L" +
                  x(groups[index][0].providerAt) +
                  "," +
                  bottom +
                  " Z"
                }
                fill={"url(#" + gradient + ")"}
              />
              <path
                d={path}
                fill="none"
                stroke="var(--chart-line)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {groups[index].length === 1 && (
                <circle
                  cx={x(groups[index][0].providerAt)}
                  cy={y(groups[index][0].pricePerOunceGBP)}
                  r="4"
                  fill="var(--chart-line)"
                  stroke="var(--card)"
                  strokeWidth="2"
                />
              )}
            </g>
          ))}
          {points.length > 0 && (
            <circle
              cx={x(points.at(-1)!.providerAt)}
              cy={y(points.at(-1)!.pricePerOunceGBP)}
              r="4"
              fill="var(--chart-line)"
              stroke="var(--card)"
              strokeWidth="2"
            />
          )}
          {active && (
            <g>
              <line
                x1={x(active.providerAt)}
                x2={x(active.providerAt)}
                y1={top}
                y2={bottom}
                stroke="var(--text-muted)"
                strokeDasharray="4 4"
              />
              <circle
                cx={x(active.providerAt)}
                cy={y(active.pricePerOunceGBP)}
                r="5"
                fill="var(--chart-line)"
                stroke="var(--card)"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
        {active && (
          <div
            className="chart-tooltip num"
            style={{
              left: Math.min(
                width - 224,
                Math.max(8, x(active.providerAt) - 80),
              ),
            }}
          >
            <span>{timestamp(active.providerAt, true)} UK</span>
            <strong>
              {money(unitPrice(active.pricePerOunceGBP, unit))}
              <small> / {unit}</small>
            </strong>
          </div>
        )}
        {!points.length && (
          <div className="chart-empty">
            <strong>
              {loading
                ? "Loading historical prices…"
                : "Waiting for the first observation"}
            </strong>
            <span>Recorded prices will appear here as the feed updates.</span>
          </div>
        )}
        <span className="sr-only" aria-live="polite">
          {active
            ? timestamp(active.providerAt, true) +
              ": " +
              money(unitPrice(active.pricePerOunceGBP, unit)) +
              " per " +
              unit
            : ""}
        </span>
      </div>
      <div className="chart-record">
        <span>
          {points.length > 0
            ? (history?.totalObservations || points.length) +
              " observations · " +
              (history?.source === "frankfurter"
                ? new Date(points[0].providerAt).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }) +
                  " to " +
                  new Date(points.at(-1)!.providerAt).toLocaleDateString(
                    "en-GB",
                    { day: "2-digit", month: "short", year: "numeric" },
                  )
                : "Collected since " + timestamp(points[0].providerAt) + " UK")
            : "No recorded period yet"}
        </span>
        <button
          className="text-button"
          onClick={() => setTable(!table)}
          aria-expanded={table}
        >
          {table ? "Hide data" : "View data"}
        </button>
      </div>
      <div className="market-footer">
        <span>
          <Clock3 size={14} />
          {snapshot
            ? (history?.source === "frankfurter"
                ? "Live quoting feed: "
                : "Updated ") + timestamp(snapshot.providerAt, true)
            : "Awaiting provider"}
          <i
            className={connected ? "connection-dot" : "connection-dot offline"}
          />
          {connected ? "Connected" : "Reconnecting"}
        </span>
        <button onClick={onRefresh} disabled={refreshing}>
          <RefreshCw size={14} className={refreshing ? "spin" : ""} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p className="chart-provenance">
        {history?.source === "frankfurter" ? (
          <>
            Daily gold reference rates in GBP from{" "}
            <a href="https://frankfurter.dev" target="_blank" rel="noreferrer">
              Frankfurter
            </a>
            , based on institutional sources. All time covers available data
            from{" "}
            {new Date(
              history.metadata?.availableFrom || history.points[0]?.providerAt,
            ).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
            . Reference rates may differ from the live quoting price.{" "}
            {history.metadata?.warning}
          </>
        ) : (snapshot?.source || history?.source) === "fixture" ? (
          "Simulated prices for demonstration. Only collected observations are shown; earlier history is not available."
        ) : (
          <>
            Live source:{" "}
            <a
              href={(snapshot?.source || history?.source) === "goldapi" ? "https://www.goldapi.io/" : "https://gold-api.com/docs"}
              target="_blank"
              rel="noreferrer"
            >
              {(snapshot?.source || history?.source) === "goldapi" ? "GoldAPI.io" : "Gold-API.com"}
            </a>
            . Updates every 30 seconds. Only collected observations are shown;
            earlier history is not available for the live feed. Gaps represent
            missing observations.
          </>
        )}
      </p>
      {(error || historyError) && (
        <p className="feed-error" role="status">
          {error || historyError}
        </p>
      )}
      {table && (
        <div
          className="chart-data table-scroll"
          role="region"
          aria-label="Chart observations"
          tabIndex={0}
        >
          <table>
            <caption>Latest 20 plotted observations · GBP per {unit}</caption>
            <thead>
              <tr>
                <th>Time (UK)</th>
                <th>Gold price</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {points
                .slice(-20)
                .reverse()
                .map((point) => (
                  <tr key={point.providerAt}>
                    <td>{timestamp(point.providerAt, true)}</td>
                    <td>{money(unitPrice(point.pricePerOunceGBP, unit))}</td>
                    <td>{point.source}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
