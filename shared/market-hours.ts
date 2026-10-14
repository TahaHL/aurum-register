// Aurum Register's published demo dealing hours, not a provider market-status claim.
// Conservative fixed UTC closure: Friday 21:00 through Sunday 22:00.
export function weekendDeskClosed(now: number): boolean {
  const date = new Date(now),
    day = date.getUTCDay(),
    hour = date.getUTCHours();
  return (day === 5 && hour >= 21) || day === 6 || (day === 0 && hour < 22);
}
export const WEEKEND_NOTICE =
  "Weekend desk closed: new live-price offers resume Sunday at 22:00 UTC, once a fresh provider price arrives. Existing holds and inventory actions remain available.";
