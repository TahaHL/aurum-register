# Sale-loop delivery — 14 October 2026

The first priority from the source review is implemented. An owner can complete a reserved quote as a sale or release the hold early. Customer pages show Taha Hadj Lakehal, explain the next step and refresh status without reloading. No public contact details were supplied; the page directs customers back to the sender.

## Stock invariants

| Transition | Total units | Reserved units | Available units |
| --- | --- | --- | --- |
| Held → Sold | minus quantity | minus quantity | unchanged |
| Held → Released | unchanged | minus quantity | plus quantity |
| Sold / Released → any new outcome | rejected | unchanged | unchanged |

The transaction locks reservation then lot, rechecks sale expiry after waiting, records completion metadata and appends the audit event before committing. A failed audit insert rolls back the stock and reservation changes. Identical retries return the stored outcome; a reused key with changed inputs fails. Two reservations cannot share a dealer's completion key. The quote's price snapshot is untouched.

Owners only; dealer boundaries apply in the query and database constraints. Staff can still receive inventory and issue quotes. Expiry continues to release only held reservations. An expired hold cannot be sold by racing a delayed expiry sweep. No partial sale, reversal, refund, payment capture, delivery or tax calculation is implemented.

## Verification

- TypeScript typecheck and production build: passed.
- Unit/domain/API: 57 passed, four native PostgreSQL races skipped.
- Browser: all 13 passed; six relevant scenarios passed again after final mobile/reference-label changes. Checks cover desktop/mobile dialogs, customer polling, existing chart periods and automated accessibility.
- Manual preview: issued and accepted a clearly labelled fictional counter-collection quote, marked it sold, observed the customer's updated status and captured screenshots.
- Native PostgreSQL: attempted locally; initdb failed on Windows restricted-token creation. Earlier acceptance/receipt/stress results supplied by the external reviewer are recorded as external evidence only. New concurrent sale retries and sale-versus-release tests are present for TEST_DATABASE_URL/CI.
- Live Gold-API.com feed restored after granting network access. No synthetic fallback replaces missing live prices.

## Small presentation fixes included

Neutral Released tags; right-aligned desktop totals; mobile quote records showing status and actions without horizontal scrolling; explicit reference-price headline label; unused serif font import removed. Keyboard focus indication retained.

## Next priorities from the review

1. Buy-back quotations with direction-specific pricing and stock receipt rules.
2. Default premiums per lot and realistic sale-versus-scrap seed products.
3. Prepare a separate clean presentation database; retain existing local records until a deliberate reset/export workflow is agreed. Automated browser tests now use a separate database.
4. Public repository and hosted demo with native PostgreSQL and green CI. Not published in this step.
5. Observe provider weekend timestamp behavior, then implement an explicit market-closed policy. The 120-second freshness rule is unchanged.
6. Consolidate the two stylesheets and refine mobile ticket positioning. This step added focused component styles, not a wholesale CSS rewrite.

## Interview walkthrough

Explain why accepting a quote keeps its price fixed, why completing a reservation does not rewrite that quote, how total and reserved counters differ, why the expiry check happens after locks, and why the same request can safely be retried. Then explain the limits: Sold records an owner action; it does not prove money arrived.
