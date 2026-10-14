import { ArrowUpRight, FileText } from "lucide-react";
import { useState } from "react";
import ReservationDialog from "./reservation-dialog";
import type { Quote } from "../../shared/types";
import { formatGBP } from "../../shared/pricing";
import { Status, stamp, remaining } from "./quote-ui";

export default function QuoteHistory({
  quotes,
  now,
  tab,
  onViewAll,
  role,
  onUpdated,
}: {
  quotes: Quote[];
  now: number;
  tab: string;
  onViewAll: () => void;
  role: "owner" | "staff";
  onUpdated: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<{
    quote: Quote;
    action: "sold" | "released";
  } | null>(null);
  return (
    <section className="panel quotes-panel">
      <div className="section-title">
        <div>
          <h2>Recent quotes</h2>
          <p>Immutable price snapshots · latest 50</p>
        </div>
        {tab === "overview" && (
          <button className="text-button" onClick={onViewAll}>
            View all
            <ArrowUpRight size={15} />
          </button>
        )}
      </div>
      {quotes.length ? (
        <div
          className="table-scroll"
          role="region"
          aria-label="Recent quotes table"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Reference / lot</th>
                <th className="money-cell">Total</th>
                <th>Status</th>
                <th>Issued</th>
                <th>Quote / hold expiry</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.reference}</strong>
                    <small>
                      {item.quantity} × {item.lotName}
                    </small>
                  </td>
                  <td data-label="Total" className="money-cell">
                    {formatGBP(item.totalPence)}
                  </td>
                  <td data-label="Status">
                    <Status quote={item} now={now} />
                  </td>
                  <td data-label="Issued">{stamp(item.createdAt)}</td>
                  <td data-label="Quote / hold expiry">
                    {item.reservation?.status === "held"
                      ? remaining(item.reservation.expiresAt, now)
                      : item.status === "accepted"
                        ? "–"
                        : remaining(item.expiresAt, now)}
                  </td>
                  <td data-label="Outcome">
                    {item.reservation?.status === "held" ? (
                      role === "owner" ? (
                        <div className="reservation-actions">
                          <button
                            className="text-button"
                            disabled={
                              Date.parse(item.reservation.expiresAt) <= now
                            }
                            onClick={() =>
                              setSelected({ quote: item, action: "sold" })
                            }
                          >
                            Mark sold
                          </button>
                          <button
                            className="text-button"
                            onClick={() =>
                              setSelected({ quote: item, action: "released" })
                            }
                          >
                            Release now
                          </button>
                        </div>
                      ) : (
                        <small>Owner action required</small>
                      )
                    ) : item.reservation?.closedAt ? (
                      <small>{stamp(item.reservation.closedAt)}</small>
                    ) : (
                      "–"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <span className="empty-icon">
            <FileText size={22} />
          </span>
          <strong>Your first quote starts here.</strong>
          <p>Select a lot, set a premium and issue a five-minute quote.</p>
        </div>
      )}
      {selected && (
        <ReservationDialog
          quote={selected.quote}
          action={selected.action}
          onClose={() => setSelected(null)}
          onSaved={onUpdated}
        />
      )}
    </section>
  );
}
