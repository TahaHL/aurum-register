# Bullion storefront — phase 1 review

14 October 2026. Local preview: http://127.0.0.1:5194/prices/xag

This is the first phase of the supplied Bullion Store Demo Proposal. It uses the proposed name Hadj Lakehal Metals. The deployed Aurum Register release and GitHub repository have not been renamed or replaced in this phase.

## Implemented

- Free GBP adapters for gold (XAU), silver (XAG), platinum (XPT) and palladium (XPD). All four returned successful live responses during this implementation.
- Shared 30-second server refresh and SSE delivery. Each feed validates its metal, currency, positive price and timestamp independently; a failing metal retains its last successful observation.
- Additive migration 007 gives historical observations a metal identity and prevents cross-metal timestamp collisions. Existing records default to gold.
- Four-cell navy ticker below navigation on public charts and the dealer workspace. Each cell links to its chart, reports live/stale/simulated state, and shows changes with an arrow and numbers. Mobile scrolls horizontally.
- Public routes /prices/xau, /prices/xag, /prices/xpt and /prices/xpd. Chart unit conversion, keyboard inspection, CSV export, high/low and time axis are reused.
- Every existing gold period remains, with 1 month added. Silver, platinum and palladium show collected observations only. No invented price history or gold reference series is reused for other metals.
- Accessible public header, demo notice, footer, public chart link from dealer login and proposed brand in customer/dealer views.

## Honest data boundaries

The provider does not supply a day-open value in the response used here. Changes are therefore labelled as change since the first recorded observation today (UTC), not exchange-open performance. The common timestamp is the oldest metal observation, and each metal has its own freshness label. The 120-second stale threshold remains enforced for existing gold quote creation. Multi-metal basket locks are phase 3.

Observed history retains seven days, as in the previous app. Long-period buttons on other metals show only available observations, with an explicit notice that no long-term reference source is connected. The first displayed collection date refers to the first retained observation. Public chart prices are indicative; the existing gold dealer workflow is retained.

## Next phases

2. Product catalogue, categories, tiers, stock imagery and product pages.
3. Basket, immutable ten-minute locks, simulated checkout and atomic order allocation.
4. Acquisition cost lots, FIFO, owner-only profit reporting and order administration.
5. Customer accounts, holdings, storage and expanded sell packages.
6. Offer rules, alerts, calculator, guides and polish.

The proposal understates backend scope: a product can span several cost lots; basket locks, order allocation and FIFO require additional transactional invariants and concurrency tests. The existing sale loop already records stock leaving the business.

Tax treatment, storage VAT assumptions, shipping insurance limits and cancellation fees must be verified before implementing customer-facing rules. No real payment details, emails, shipping, ratings or accreditations will be used. All spending remains prohibited.

## Provider reference

https://gold-api.com/assets/ lists the four metals and describes the real-time API as free. Direct GBP endpoint responses were also checked; this does not guarantee future provider availability or terms.

## Prompt A follow-up (14 October 2026)

This section supersedes the original phase-1 transport and day-open notes above.

- Separate configurable per-IP read (1,200/minute) and mutation (120/minute) budgets. Health reads are exempt. SSE handshakes use a six-concurrent-connections cap with disconnect cleanup and a Retry-After response. Login's existing independent limiter remains unchanged.
- One MarketsProvider per page owns the initial market fetch and EventSource. Dealer and public views consume it; the ticker no longer requests history.
- The server includes dayOpen and firstObservedAt with each metal. SQL AT TIME ZONE uses Europe/London midnight, including BST. firstObservedAt is the earliest retained observation, consistent with the seven-day retention policy. An unavailable summary is null, never fabricated.
- The session bootstrap honours Retry-After (or RateLimit reset), automatically retries once and then offers manual retry. Timers and stale responses are cancelled when the view unmounts.
- Public charts no longer show a page-reloading Refresh button. Dealer refresh remains available.
- Source Serif package/import/usages removed. Four top-level :root blocks (not three) were merged. Six provably shadowed declarations were removed; repeated selectors with distinct properties or conditional rules are retained to preserve the cascade.
- Existing pricing, ledger, buy-back and authentication domain files are unchanged. No catalogue, basket, admin expansion, push or deployment was performed.

### New verification coverage

- tests/rate-limits.test.ts: read threshold, independent write budget, health exemption, seventh SSE rejection and slot release.
- tests/metals.test.ts: UK midnight in BST and GMT, empty/current-day cases and metal isolation.
- tests/browser/metals.spec.ts: all gold ranges, one stream on public and dealer pages, no ticker history polling after clock advancement, no public Refresh control.
- tests/browser/session-recovery.spec.ts: one automatic retry; repeated 429 stops at the manual button.
- playwright.config.ts supports BROWSER_EXTERNAL_SERVER=true so a runner can own and stop the API and Vite processes directly. Default and CI behavior are retained.

### Limits of verification

Native PostgreSQL could not start in this Windows sandbox: initdb reports restricted-token errors 87/3, followed by a directory-creation error. The five native race tests remain unverified for these local changes. Claude's reported PostgreSQL result covers the previous handover, not this patch. Migration 007 has not been tested on Neon; Prompt A defers that until review.

Before/after screenshots were captured for sign-in, dealer desk, gold chart, silver chart and customer quote at 390px and 1440px. They show the font change and retained structure, but use different market datasets/times and therefore are not a pixel-identical visual regression assertion.

### Verification results for Prompt A

- `npm run typecheck`: passed (exit 0).
- `npm test`: `Test Files 10 passed (10)`; `Tests 75 passed | 5 skipped (80)`; exit 0. Skips are the native PostgreSQL race cases.
- `npm run build`: passed before the browser runs. Final formatting/font-only build is recorded in the review report.
- `npm run test:browser`, full run 1: `19 passed (1.5m)`; exit 0; 0 logged server limiter rejections.
- Full run 2: `19 passed (1.2m)`; exit 0; 0 logged server limiter rejections.
- Full run 3: `19 passed (1.3m)`; exit 0; 0 logged server limiter rejections.
- Each full run used a new PGlite database, a new API/Vite process pair and the default 1200/120 request budgets. The runner invoked the npm script with BROWSER_EXTERNAL_SERVER=true; this avoids Windows nested-process teardown issues without skipping scenarios.
- The two 429 session-recovery tests intentionally mock HTTP 429 in the browser. These are expected test inputs, not server limiter rejections.
- Native PostgreSQL startup command exited 1 before the tests could execute. No Neon or hosted database was accessed.

After the three full runs, a final typography-only cleanup set the remaining logo and dealer price fonts to Geist/Geist Mono; formatting was applied. Targeted design, accessibility, chart, market-connection and dealer checks were rerun separately. See the accompanying review report for their result.

Final focused result: `11 passed (1.3m)`, exit 0. Final typecheck and production build also passed with exit 0. Native PostgreSQL verification remains blocked as described above.
