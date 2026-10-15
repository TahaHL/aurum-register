# Hadj Lakehal Metals store

A fictional UK bullion store and dealer workspace. No money is transferred, no card details are collected, and no goods are shipped.

## Routes

| Route | Purpose |
| --- | --- |
| `/`, `/store` | Customer storefront |
| `/catalogue` | Server-priced collection, filtering, sorting, quantity breaks and pagination |
| `/products/:slug` | Specifications, tiers, VAT and indicative buy-back |
| `/prices/xau`, `/prices/xag`, `/prices/xpt`, `/prices/xpd` | Observed intraday prices and daily reference history |
| `/basket`, `/checkout` | Session basket and simulated checkout |
| `/account` | Separate customer identity, orders and indicative holdings |
| `/sell-to-us` | Read-only indicative buy-back list |
| `/desk` | Existing quotes, reservations, sales, releases and inspected buy-backs |
| `/admin` | Store orders, inventory, product pricing, reporting, customers and activity |

## Key decisions

Prices are calculated on the server using Decimal, integer milligrams, basis points and pence. Store unit prices round half-up to pence; multiplying the displayed unit price by quantity gives the exact net line amount. The base and premium split reconciles to that amount. VAT rounds half-up once per line. The original desk `calculateQuote` function is unchanged.

Customer checkout and dealer quotes are separate workflows. Catalogue packs can contain multiple items and require quantity tiers and VAT, so they cannot accidentally pass through the older single-item desk calculator. Original desk lots remain available in the dealer workspace. Store checkout nevertheless respects `reserved_units` when allocating any linked stock.

Every checkout lock is an immutable ten-minute snapshot containing the spot, provider timestamp, source, selected tier, quantity, unit price, net amount and VAT. An expired lock must be refreshed and reviewed. It reserves a price, not inventory; stock is checked again at order placement.

Order placement locks the customer row to serialise retries, then all candidate lots in `(product_id, acquired_at, id)` order. FIFO allocations, stock deductions, order lines and the audit event commit together. Failure rolls everything back. Repeating a request or submitting the same lock returns the original order; reusing a request ID with a different lock is rejected. The expiry is checked again after acquiring stock locks.

Cancellation is owner-only and only permitted before dispatch. It locks the order, then the original allocated lots in the same stock-lock order and restores those exact units. Repeating cancellation cannot restore twice. Dispatch and delivery use an explicit state transition check.

Customer identities live in a separate table and session field from dealer identities. Customer sign-in regenerates the session and cannot grant dealer privileges. Each demo visitor receives a distinct fictional account, so visitors do not share order histories. Password hashes use the existing scrypt implementation. Signed, HttpOnly server sessions retain the existing origin validation and rate limits.

Staff reporting uses an explicit allow-list. Cost lots, COGS, margin, profit and unrealised values are excluded by the API, rather than hidden only in the browser. Financial CSV is owner-only. Store audit entries containing receipt costs are excluded from the legacy staff workspace response as well.

## Market data and demo data

Live feeds use the free public Gold-API.com endpoints. Frankfurter daily GBP reference history has separate persisted caches for each metal, with shared refresh, six-hour caching and per-metal failure isolation. Historical reference prices never substitute for a stale executable spot feed. Intraday charts contain recorded observations only. The original gold cache is migrated to the XAU key.

`PRICE_PROVIDER=fixture` is for reproducible demos and tests. Both the live prices and deterministic daily series are explicitly labelled simulated; the daily series is not represented as historical market data.

The supplied catalogue contains 110 product records. Names and specifications are supplied data and still require verification against the mint/refiner before real use. Premiums, stock quantities and buy-back discounts are fictional. Original SVG illustrations do not reproduce product photography, mint logos or packaging.

Opening stock is divided deterministically into one to three lots acquired 30–150 days earlier. Fictional cost is calculated using the last available daily reference point on or before acquisition, plus 40% of the tier-one premium. The source and timestamp are retained in the supplier reference. If historical prices are unavailable, cost stays unknown; the application does not invent a historical price.

When demo accounts are enabled, an idempotent seed creates a deterministic schedule of simulated delivered orders across the preceding 90 days, where reference data and eligible stock exist. They use historical snapshots and FIFO allocations. The number of seeded orders can be below 90 when stock or reference data is unavailable. These are not genuine business transactions.

## Accounting boundaries

Revenue excludes VAT and cancelled orders. COGS sums immutable FIFO allocation costs. Gross profit is revenue less COGS. Demo postage defaults to an assumed £7.50 per non-cancelled order and can be changed for the selected report. It is a reporting assumption, not an actual expense or shipping integration. Unrealised inventory changes are shown separately from realised results. Missing costs withhold affected profit totals rather than being treated as zero.

The simplified demo tax model assumes catalogue gold qualifies for investment-gold exemption; silver, platinum and palladium use 20% for UK delivery. This is not a general tax engine. HMRC's [VAT Notice 701/21](https://www.gov.uk/guidance/gold-acquisitions-imports-investments-and-vat-notice-70121) defines eligibility conditions: do not apply zero VAT solely because an arbitrary product contains gold. Re-check current rules and each product's eligibility before real use.

## Testing and limitations

`npm run typecheck`, `npm test`, `npm run build` and `npm run test:browser` cover the local application. Set `TEST_DATABASE_URL` to an isolated PostgreSQL database to run multi-connection concurrency tests. Each native test suite creates and cleans its own random schema. PGlite checks do not establish multi-connection correctness.

The existing GitHub Actions workflow supplies PostgreSQL 18 and runs the native tests. A local passing run does not establish that an unpushed GitHub revision has green CI.

This remains a portfolio demonstration: no payment processor, shipping carrier, transactional email, password recovery, identity verification, regulatory compliance workflow or guaranteed financial valuation. Guides intentionally show a coming-soon page. Full production operations and all product specifications are outside the claims made by the demo.
