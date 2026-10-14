# QuoteLedger interface direction

Reviewed on 14 October 2026 through the public websites and rendered browser pages. These are qualitative design observations, not claims about conversion rates or market share.

| Reference | Observed pattern | Applied to QuoteLedger |
| --- | --- | --- |
| [APMEX gold prices](https://www.apmex.com/gold-price) | Persistent dark metal-price strip, white masthead, prominent sans-serif price and compact chart controls. | Separate live GBP strip, clean masthead, tabular values and a compact time-range toolbar. |
| [BullionByPost gold prices](https://www.bullionbypost.co.uk/gold-price/) | Current price, change and period high/low are grouped; units and periods are easy to reach; stock categories follow the chart. | Price statistics together, every requested period directly accessible, and a stock catalogue below the chart. |
| [BullionVault chart](https://www.bullionvault.com/gold-price-chart.do) | A chart-first page with a compact toolbar and a clear path toward dealing. Its chart area was blank in the browser capture, so the rendered chart itself was not assessed. | Give market data most of the available width and put the actual quote ticket beside it on desktop. |

The earlier QuoteLedger concept had oversized serif headings, repeated bordered cards and large vertical gaps. It gave market data and small supporting labels too similar a visual weight. The revised design uses Geist, a restrained navy/gold palette, sharper controls, one compact inventory summary and fewer intervening sections between chart and quote creation.

The references are retail or investment services. QuoteLedger remains a dealer quotation and inventory demo. It therefore keeps owner/staff roles, immutable quotes, temporary reservations and audit history rather than adding a shopping basket, fake reviews, accreditation badges or unsupported silver prices.

The current request supersedes the original visual treatment in DESIGN.md. That original brief is retained as project history. Pricing sources, historical range semantics and business rules remain unchanged.

Validation for this revision: TypeScript and production build passed; all eleven existing Playwright scenarios passed in one run, including chart controls, all requested range requests, source separation, quote acceptance, inventory receipt/correction, roles, responsive overflow checks and axe checks at 390, 768, 1024 and 1440 pixels. No backend rules changed. Earlier native PostgreSQL, Docker and hosted-deployment limitations still apply.
