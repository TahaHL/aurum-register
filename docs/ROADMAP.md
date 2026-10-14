# QuoteLedger roadmap

## Milestone 1 — fictional desk

Implemented: seeded lots, decimal valuation, fixture feed, optional GoldAPI adapter, price caching and SSE, five-minute immutable quotes, hashed customer-link tokens, idempotent stock reservation, fifteen-minute hold expiry, append-only audit events and responsive dealer/customer interfaces.

Tests cover numerical examples, invalid inputs, price failures/staleness, snapshots, tokens, expiry, retry behaviour, event immutability and HTTP failures. Native PostgreSQL race tests require TEST_DATABASE_URL and must not be claimed as verified from PGlite. The README records the checks actually completed.

## Milestone 2 — authenticated inventory management

Implemented:

- Sign-in with express-session, a PostgreSQL-compatible session store, salted scrypt passwords and signed HttpOnly/SameSite cookies. Login regenerates sessions, logout invalidates them and an absolute eight-hour deadline limits their lifetime.
- Owner/staff roles, dealer-scoped queries and composite database constraints. Demo account disabling also rejects previously created demo sessions. Domain tests exercise a second dealer.
- Receiving stock for both roles, owner-only corrections, weight/purity/quantity validation, required reasons, reserved-stock protection and durable idempotency keys. Movements and actor/before/after audit events commit atomically.
- Owner/staff sign-in shortcuts, receiving/correction dialogs, role-aware controls, inventory search and readable activity history.
- Migration of existing fictional quotes and audit events without changing their original amounts or weakening immutable triggers.

Verification: **33 unit/domain/API tests pass; two native PostgreSQL concurrency tests are skipped without TEST_DATABASE_URL. All five browser scenarios passed, including targeted reruns after fixes.** TypeScript and production builds pass. Browser coverage includes authentication, inventory changes, quote acceptance, responsive layouts and automated accessibility checks.

Remaining product work:

- Add server-side search and pagination. Current responses cap lots at 200 and quotes/events at 50; client search only covers loaded inventory.
- Implement private account provisioning, password reset and dealer onboarding before supporting private users. No self-service sign-up or account administration exists yet.
- Verify keyboard and screen-reader journeys alongside automated accessibility checks.
- Create genuine issue/branch/PR history and request a real developer review. Document the AI assistance and be able to explain each material design decision.

## Milestone 3 — market chart and bullion-inspired interface

Implemented: navy/gold horizontal navigation, inventory search, illustrated lot cards and clearer quote controls. The default Gold-API.com adapter retrieves real XAU/GBP prices without a key, validates and caches them, and persists distinct observations. The chart provides recorded-history ranges, troy ounce/gram/kilogram units, period high/low/change, keyboard/pointer inspection, table and CSV access. Sources remain isolated, missing observations break the line, and seven-day retention bounds storage. Historical backfill is not implemented; a new installation starts collecting from its first observation.

Verification: 43 unit/domain/API tests pass; two native PostgreSQL concurrency tests remain skipped. Browser verification covers the chart, provider failure, gaps, original dealing workflows and accessibility at three widths. Real GBP delivery was observed in the running preview; this does not verify the separate optional GoldAPI.io adapter.

## Milestone 4 — supplied design and historical gold ranges

Implemented: warm paper/ink design with locally bundled Source Serif 4, Geist and Geist Mono; compact navigation, a full-width chart, mobile navigation, stock cards, a receiving drawer, customer countdown progress and activity grouped by day. Existing authentication, inventory and reservation features remain intact.

The chart now offers Live, 1D, 1W, 3M, 6M, 1Y, 2Y, 3Y, 5Y, 10Y and All. Week-and-longer ranges use validated Frankfurter daily GBP reference history, available from 6 January 1999, with a persistent six-hour cache and labelled outage fallback. Live and 1D retain actual collected intraday observations. Historical reference prices never replace the executable quote feed. Full intraday backfill remains future work.

Verification: 50 unit/domain/API tests and eleven browser scenarios passed across base and targeted runs; two native PostgreSQL race tests remain skipped. TypeScript and production builds pass. Additional checks cover calendar boundaries, cache persistence, refresh coalescing, unavailable providers, all requested ranges, source separation and responsive/axe checks across the four dealer pages. Both real data sources were observed in the preview. This does not verify remote CI, native concurrency or a hosted deployment.

## Milestone 5 — operational and hosted verification

- Run both independent-client race tests against native PostgreSQL: final-unit acceptance and concurrent stock-receipt retries. Add a lock-wait crossing quote expiry.
- Verify the GoldAPI adapter with an actual key and document provider limits/timestamp semantics.
- Test worker restart/recovery and two worker instances; move recurring work to a durable scheduled worker if needed for hosting.
- Test the Docker image as non-root with health, sign-in, a stock change and a complete quote journey. Generate SESSION_SECRET in `.env` first; the included Compose configuration enables public fictional demo accounts and is for local use.
- Add request-aware structured logging, graceful-shutdown recovery and a synthetic-data restore exercise.
- Deploy a synthetic-data staging/demo environment with native PostgreSQL, HTTPS APP_ORIGIN, a persistent random SESSION_SECRET and the correct trusted proxy setting. Verify Secure cookies, logout and session expiry through the actual proxy. Hosted deployment is not complete.

Native PostgreSQL concurrency, Docker execution and live GoldAPI delivery remain unverified. The existing authentication does not turn the fictional demo into a commercial trading service.

## Outside the initial release

Other metals/currencies, payment capture, shipping, tax calculation, hedging, self-service multi-dealer onboarding and commercial trading. Dealer isolation already exists in the schema and request scope; managing multiple dealer accounts through the product remains future work.

## Milestone 6 — complete the sale loop (14 October 2026)

Implemented owner-only Mark sold / Release now, atomic stock outcomes, durable retry protection, required reasons and audit events; customer dealer identity, next steps and five-second polling. Migration 005 preserves existing records and changes the original demo dealer name to Taha Hadj Lakehal. Existing chart periods remain intact. Small reference-price, mobile quote, status, alignment and unused-font fixes are included.

Verification: 57 unit/domain/API tests passed; four native PostgreSQL tests skipped. Typecheck/build passed. All 13 browser tests passed, with six relevant reruns passing after final responsive changes. Native startup was attempted but blocked by Windows sandbox restrictions. See SALE_LOOP.md for implementation details, external-review evidence and the remaining priorities.
