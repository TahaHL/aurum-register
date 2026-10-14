import type { LedgerEvent } from "../../shared/types";

import { EventRow } from "./quote-ui";

export default function ActivityPanel({
  events,
  tab,
}: {
  events: LedgerEvent[];
  tab: string;
}) {
  const grouped = events
    .slice(0, tab === "overview" ? 5 : 50)
    .reduce<Record<string, LedgerEvent[]>>((groups, event) => {
      const day = new Date(event.createdAt).toLocaleDateString("en-GB", {
        timeZone: "Europe/London",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      (groups[day] ||= []).push(event);
      return groups;
    }, {});
  return (
    <section className="panel activity-panel">
      <div className="section-title">
        <div>
          <h2>Desk activity</h2>
          <p>Quotes and stock movements · latest 50</p>
        </div>
        <span className="activity-label">
          <i />
          AUDIT TRAIL
        </span>
      </div>
      {events.length ? (
        Object.entries(grouped).map(([day, entries]) => (
          <div key={day}>
            <h3 className="event-day">{day}</h3>
            {entries!.map((event) => (
              <EventRow event={event} key={event.id} />
            ))}
          </div>
        ))
      ) : (
        <div className="empty compact">
          Your next quote will start the paper trail.
        </div>
      )}
    </section>
  );
}
