# QuoteLedger: source-backed assessment of the external review

Assessment date: 14 October 2026.

Scope: the supplied review was checked against the local application source, tests, workflow configuration and current development-server response headers. No application code or business rules were changed. No tests, remote CI jobs, native PostgreSQL race checks or new manual screen-reader sessions were run during this assessment. Prior test results remain historical evidence, not fresh verification of this report.

The original review correctly labels its findings as hypotheses. This document distinguishes confirmed gaps from features already present and design choices. Paths and line numbers refer to the source at assessment time, relative to the repository root.

## 1. Overall judgement

The core product assessment is sound: this is a small dealer's inventory, quotation and reservation desk. Pricing accuracy and transactional acceptance are its strongest technical features. A market chart supports that workflow.

The strongest confirmed weaknesses are incomplete customer-state refresh, dashboard totals derived from truncated lists, secrets carried in request URLs, and insufficient operational evidence for native concurrency. The proposed visual refinements are reasonable experiments, but should not be described as defects established through user research.

The review overstates the amount of missing security and form behaviour. Production-secret checks, production demo-account defaults, token hashing, expiry locking, live estimates and stock-correction previews already exist. Reimplementing them would create unnecessary risk.

## 2. Correctness and security: C1–C7

| ID | Verdict | Evidence and recommended action |
| --- | --- | --- |
| C1: native PostgreSQL race tests in CI | Configuration exists; execution evidence missing | `.github/workflows/quality.yml:8` already provisions PostgreSQL 18 and sets `TEST_DATABASE_URL`. `tests/ledger.test.ts:115` checks two competing acceptances for the final unit; the second native test checks receipt retries. Add the requested 20-contender case and lock-wait expiry case, then obtain a real native run. Do not equate workflow configuration with successful CI. |
| C2: customer-token transport | Confirmed gap, with partial protections already present | `src/App.tsx:288` generates a query-token link; `src/components/customer-quote.tsx:19` also puts it in the API query; `server/app.ts:122` reads it there. Only the hash is stored (`server/ledger.ts:225`) and comparison is timing-safe (`:424`). Move newly issued links to fragment-based secrets and use a header or POST body for requests. A path-based secret is still part of request URLs and is not an equivalent fix. |
| C3: production secret and demo credentials | Already implemented; add explicit regression evidence | `server/auth.ts:103` rejects an absent/short production secret. At `:121`, demo accounts default off in production unless `DEMO_ACCOUNTS=true`. Keep that existing setting instead of introducing a conflicting `DEMO_MODE` switch. Add tests for the configuration matrix and startup failure. |
| C4: customer sees reservation release | Confirmed gap | `src/components/customer-quote.tsx:18` fetches once, then only updates a local clock; acceptance updates local state. The open page does not fetch the released server state. Poll with cancellation/error handling while relevant, refresh on visibility/focus, and stop after terminal states. Keep server state authoritative. |
| C5: server-wide dashboard aggregates | Confirmed gap | `server/ledger.ts:142` limits lots to 200 and quotes/events to 50. `src/App.tsx:214` computes counts from those loaded rows. Add dealer-scoped aggregate queries and explicit list totals. Tests must exceed both caps and include another dealer. |
| C6: acceptance-specific limiting/retries | Partly implemented | `server/app.ts:67` already applies a general 200-request/minute IP limit. There is no dedicated acceptance/token limit. `server/ledger.ts:450` returns the original reservation for the same request ID; a different request ID produces 409. Preserve this documented idempotency contract. Add bounded acceptance protection without allowing unauthenticated requests to lock a legitimate quote indefinitely. Never use or log a raw token as a rate-limit key. |
| C7: multiple expiry workers | Locking mechanism exists; behavioural verification missing | `server/ledger.ts:510` already uses `FOR UPDATE SKIP LOCKED` inside a transaction. Add independent-client tests proving one release/event per reservation and no negative reserved counts under competing sweeps and acceptance. Do not add a second locking mechanism without demonstrating a need. |

### Referrer-policy verification

The running preview returned `Referrer-Policy: no-referrer` and CSP on `/api/health`. Its `/` HTML response, served by Vite, returned neither header. Express uses Helmet (`server/app.ts:35`), whose installed default is `no-referrer`; that does not cover HTML served independently by Vite.

Add explicit document-level protection shared by development and production and test the customer document response. Reducing URL exposure is worthwhile, but this assessment did not find or demonstrate a leaked token in actual logs. URL fragments reduce network exposure; they still need careful handling in browser history and client code.

## 3. Usability: U1–U8

| ID | Verdict | Evidence and recommendation |
| --- | --- | --- |
| U1: ticket first and live estimate | Layout change needed; estimate already works | `src/App.tsx:417` renders the chart before the ticket. The estimate is recalculated from current inputs at `:204`. Move the ticket before the chart in DOM order so keyboard, reading and visual order agree. Test stock selection, focus and responsive order. Collapsing the mobile chart is optional; preserve easy access because the user explicitly values it. |
| U2: competing open quotes | Confirmed missing contextual warning | The ticket already says “Stock is held only when your customer accepts” (`quote-builder.tsx:150`), and lot options show available units. It lacks other-open-quotes counts. Obtain accurate per-lot counts from the server, independent of the latest-50 quote list, and explain that a quote is not a reservation. The count is advisory and must never replace acceptance-time checks. |
| U3: share modal | Link copy exists; message copy missing | `src/App.tsx:546` provides Copy link. Add a plain-text Copy message using the actual reference, total, expiry and generated link. Do not invent a new quote-number format. Make copy primary and handle clipboard failure visibly. |
| U4: chart ranges, source labels and sparse data | Mixed | All requested ranges exist; 1M does not. Daily-reference versus live status is already shown in the header (`market-card.tsx:222`), with Frankfurter named below (`:646`). Add the provider to the header and clearer sparse-data text. “Collecting price observations” and coverage already exist (`:273`, `:600`); this is refinement, not creation from scratch. |
| U5: inventory valuation | New feature; define the numbers first | The table lacks fine weight and spot valuation (`inventory-panel.tsx:79`). Define per-unit fine grams versus available-stock fine grams explicitly. For a “Value at spot” column, label whether it values one unit or available units; exclude premium and display feed freshness. Use the current quoting feed and existing decimal rules. |
| U6: quote filters/details/link copying | Filters/details missing; link-copy request needs redesign | `quote-history.tsx:49` renders rows without filtering or a detail drawer. Add dealer-authorised details and meaningful status filters. A token hash cannot reconstruct a historical customer link. Defer history-link copying or implement an explicit, audited link-reissue mechanism with a separate token record; do not weaken the immutable quote trigger to make it convenient. |
| U7: correction preview | Mostly implemented | `inventory-dialog.tsx:47` computes projected available/total counts; `:161` displays current reserved stock; `:305` displays the projected result and blocks invalid changes. Improve this to a concise before → after summary with an explicit reserved floor. Keep domain validation. |
| U8: announcements and screen-reader review | Partial accessibility support; manual evidence absent | The customer countdown is not in an `aria-live` region, so it is not deliberately announced every second. Add separate threshold announcements and test expiry/reservation transitions. Chart inspection already has polite announcements and signed changes with arrows. Native modal focus behaviour exists, but focus return still deserves explicit testing. |

### Chart-period decision

Keep every user-requested period: All, 10Y, 5Y, 3Y, 2Y, 1Y, 6M, 3M, 1W and 1D, plus Live. Add 1M. A More menu may group secondary ranges; it must not silently remove them. Extend shared types, server validation, date filtering, UI and tests together. Use calendar-month subtraction, not an arbitrary 30-day approximation.

### Purity terminology

The receipt form already accepts a percentage and converts it using Decimal arithmetic (`inventory-dialog.tsx:71`). Its “99.99% = 999.9 fine gold” helper uses the conventional per-thousand expression. The internal value is 9999 parts per 10,000. Both scales can represent the same purity; label the scale rather than treating one as a numerical bug. Avoid exposing internal encoding to users unless it helps them enter a value.

### Customer references

The existing example is `DEMO-001`. “Name or phone” would encourage collecting personal information without adding a customer-management workflow. Prefer “Customer or order reference” and fictional examples in this demo.

## 4. Visual recommendations: V1–V4

| ID | Verdict | Implementation boundary |
| --- | --- | --- |
| V1: stylesheet cleanup | Confirmed maintenance problem | `src/main.tsx` imports both base and redesign styles. `ledger-design.css` itself contains older rules and a later overriding layout section. Establish one token source and component styles, remove genuinely superseded rules, and visually verify every major state. Concatenating the files does not solve the cascade problem. |
| V2: type scale and stable numbers | Partially present | Numeric classes and the main price already use tabular figures (`ledger-design.css:107`, `:399`). Numerous size overrides remain. Standardise a small scale while retaining readable labels, chart ticks and touch targets. “Four sizes” is a design guideline, not a universal accessibility requirement. |
| V3: Desk label and badges | Reasonable product choice | Renaming Prices to Desk better matches the page's tasks. Define badge units clearly: open quotations versus active reservation records versus reserved stock units. Use the new server aggregates, not truncated arrays. |
| V4: consistent card geometry | Visual refinement | A grid and shared padding already exist. Check long names, unavailable prices and fully reserved stock before deciding where equal heights help. Do not truncate necessary information to force uniformity. |

The recommendation that the ticket be the visual anchor and the main gold price be the single largest element is a tension, not an objective rule. Give the primary action clear placement and emphasis; use large numbers where they improve comparison without making the page compete with itself.

## 5. Proposed screens: what would actually change

- **Sign-in:** centred-card proposal is a design replacement for the current split presentation. Existing login/demo flows and error/session notices must survive it.
- **Desk:** ticket-first source order, current price strip, chart, accurate server summaries, stock previews and shorter recent lists. Mobile chart collapse remains a usability hypothesis rather than a required correctness fix.
- **Issued modal:** keep native dialog semantics; make Copy link primary and add Copy message. A mobile sheet must preserve focus return and not obscure expiry or errors.
- **Customer quote:** preserve public token access and fixed amounts; add server-state refresh and a reservation countdown. Do not label a locally elapsed timer “released” before the server confirms release. Sticky acceptance controls must not overlap content or mobile keyboards.
- **Inventory:** add well-defined valuation columns, status filters and explicit loaded/total counts. A mobile card view is possible, but must preserve receiving, quoting and owner-only correction. Sticky columns and scroll fades are alternatives to a card view, not requirements to implement twice.
- **Quotes:** filters/details are useful; “Latest N of total” must remain honest when filtering a capped subset. A local filter is not full-database search. Historical link copying needs the reissue decision described above.
- **Activity:** current entries are already grouped by day. Filters and clearer sentences are improvements. Reservation acceptance is performed by a token holder, so do not fabricate a staff actor such as “Alex reserved” unless that identity was actually authenticated and recorded.

## 6. Future features: F1–F5

These remain outside the review's recommended Trustworthy desk release.

| Item | Assessment |
| --- | --- |
| F1: release, extend, collected | Useful next business milestone, but larger than three buttons. Define roles, allowed transitions, idempotency, expiry races, extension limits and inventory accounting. “Collected” must reduce physical stock exactly once. Persist audit events and test collisions with expiry. |
| F2: silver | Requires a metal field, source/instrument validation, pricing and chart separation, labels, migration and tests. Do not repurpose gold prices or change old snapshot meaning. |
| F3: server-side search/pagination | Valuable beyond the immediate total-count fix. Requires stable ordering/cursors and dealer-scoped queries; filters must apply before pagination. |
| F4: multi-line quotes | Substantial domain expansion: line snapshots, per-line precision, deterministic locking order and atomic all-line acceptance. |
| F5: activity CSV | Useful, but define scope and spreadsheet-formula escaping. State whether export covers all matching events or only the loaded page. |

Reservation actions and metal expansion should not be mixed into a visual refactor. The original review explicitly excludes F1 from its next release and leaves payments, shipping, CRM, messaging and onboarding out for now.

## 7. Corrected implementation order

1. **Verification foundation:** add production-configuration regressions and the 20-contender/expiry-worker tests. Run against a disposable native PostgreSQL service where available. Keep missing remote CI evidence explicit.
2. **Token transport:** introduce fragment-based sharing and token transport outside request URLs; protect the HTML document in both environments. Decide what happens to previously issued query-token links. A client redirect cannot undo a token already included in the first request URL.
3. **Customer freshness:** cancellable polling/refresh while quotes or reservations remain active; accurate terminal states; threshold announcements; failure/retry and focus behaviour.
4. **Truthful counts:** dealer-scoped totals and per-lot open-quote counts; loaded/total labels and boundary tests above the existing caps. Define what “active reservation” and “expiring soon” count.
5. **Dealing usability:** ticket-first order, available-stock hints, competing-quote warning, primary link copy and message copy. Preserve the already-live estimate.
6. **Chart refinement:** add 1M, retain every requested period, improve provider/sparse-state labels and mobile controls without changing source separation.
7. **Secondary-screen refinements:** inventory fine weight/value, filters, correction presentation, quote details and activity filters. Defer historical-link copy unless a secure reissue design is included.
8. **Visual consolidation:** one token definition file and component styles; remove obsolete cascade layers; review desktop/mobile/sign-in/dialog/customer/error states.
9. **Release evidence:** run applicable unit/API/native database/browser/build checks; update screenshots, README, review brief and source ZIP. Record skipped or unavailable verification honestly.

This order refines the review rather than accepting every proposed solution literally. It preserves all user-requested chart periods and avoids reimplementing protections already present.

## 8. Acceptance criteria to correct before implementation

- Replace “Add production secret protection” with “Regression-test existing production secret protection.”
- Keep `DEMO_ACCOUNTS` as the single existing demo switch; production remains opt-in.
- Token-free request URLs apply to new flows; explicitly define migration of old query links. Verify the document's referrer policy, not only an API response.
- Define acceptance retries: the same request ID returns the original result; a new request ID may receive an already-accepted conflict without creating a duplicate.
- Test customer state against an actual server transition. A countdown reaching zero is not sufficient evidence of a completed release.
- Server totals must be dealer-scoped and accurate beyond 200 lots/50 quotes. Filter labels must distinguish loaded matches from total matches.
- Preserve all requested periods even when only seven primary range buttons are visible.
- Do not test that a browser estimate always equals a later issued quote while a live feed is changing. Test equality for a fixed snapshot and document that issuance uses the current server snapshot.
- Reusing one CSS token source does not mean banning responsive or state-specific overrides. Remove accidental/redundant overrides, not legitimate CSS behaviour.
- Do not claim that every audit event contains a staff actor and before/after quantities. Stock movements do; customer and automated events have different recorded details.
- A full VoiceOver run is unavailable on this Windows environment. A real Windows screen-reader pass would be a relevant alternative, but it has not been completed and cannot be replaced by an axe claim.
- Existing tests must remain meaningful; add regressions for real failure modes rather than mechanically creating one test per prose checklist item.

## 9. Outcome of this assessment

The review supports a useful next release, with the corrections above. Confirmed defects and evidence gaps should lead; the current application does not need a wholesale rewrite. This assessment changed documentation only and did not implement the release.

## Follow-up after external source review — 14 October 2026

The owner sale/release workflow has now been implemented; see SALE_LOOP.md. This assessment above remains a historical snapshot of the earlier code. The external reviewer reported native PostgreSQL race/stress successes, but this environment still cannot initialise native PostgreSQL. Do not describe those external results as our local verification or extend them to the new sale code. Current local evidence: 57 unit/domain/API tests pass, four native races skip; production build/typecheck pass; 13 browser scenarios pass plus six relevant reruns after final responsive changes.
