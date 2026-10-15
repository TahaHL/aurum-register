# Case study: Hadj Lakehal Metals

## Problem

A small bullion dealer needs to connect changing metal prices with physical inventory. A customer needs a clear price breakdown; the owner needs to know whether the stock can be sold and what the sale earned after its acquisition cost.

## Implementation

The application joins a React/TypeScript storefront to an Express API and PostgreSQL ledger. The supplied 110-product catalogue spans gold, silver, platinum and palladium. Customer checkout snapshots its price for ten minutes; the final transaction allocates available stock FIFO and writes immutable order/cost records. Owner reports derive revenue and profit from those records, while staff receive a restricted response.

The admin overview prioritises four metrics, a revenue/profit chart, current stock warnings and recent orders. Exact chart values remain available in a table. Separate customer, owner and dealer views are accessible through a shared view switcher.

## Engineering tradeoffs

- Local PGlite removes setup friction; native PostgreSQL is used for multi-client race verification.
- Price locks do not reserve stock. A customer may need to retry if stock sells before checkout; the database must never oversell to make the interface appear successful.
- Stored costs support realised FIFO profit. Current spot valuation is shown separately and is not cash revenue.
- Public data is free but has no application-guaranteed uptime. Stale prices block new locks; reference prices are not silently substituted for live execution.
- Original illustrations avoid relying on copied product photography. The catalogue remains explicitly fictional pending specification verification.

## Development process

Taha Hadj Lakehal developed this portfolio project with AI assistance. The test suite covers arithmetic, permissions, transactions, concurrency and browser journeys. The README links to CI so reviewers can inspect results for the actual revision.

## Boundaries

Payments, stock and orders are simulated. There is no payment processor or real delivery integration. No revenue, customer adoption or commercial performance is claimed. See STORE_ARCHITECTURE.md for the full data flow and limitations.
