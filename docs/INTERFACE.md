# Aurum Register: dealer-counter interface

14 October 2026. Original implementation informed by public bullion interfaces.

## References and decisions

- BullionByPost: https://www.bullionbypost.co.uk/gold-price/live-gold-price/ — observed clear period, currency and weight controls next to the market price. Aurum Register keeps its requested periods and explicit reference/live distinction. It does not copy the shop header, promotions or trust badges.
- BullionVault: https://www.bullionvault.com/order-board.do — observed an order board organised into comparable price and quantity rows. Aurum Register applies that density to physical stock, without claiming exchange functionality or copying the board.

## Structure

The price screen is a shared market canvas and stock book. Inventory rows replace decorative product cards; selecting one opens its sales ticket. Quotes and activity have dedicated navigation destinations rather than duplicating long tables on the price screen. Counts act as shortcuts to quotations.

A quotation opens as a right-hand slip on desktop and a full-screen task on phones. The native modal isolates keyboard focus; Escape/close returns focus and preserves a draft. Successful issue closes the slip and opens the customer-link result. The form mounts only while open, avoiding duplicate hidden labels on the buy-back screen.

Mobile uses persistent bottom navigation, a single-column market view, and horizontally scrollable chart-period buttons with 44px targets. The quote form no longer sits above or below a long chart. All existing historical periods remain available.

Evergreen navigation, warm paper, fine rules and restrained serif page titles give the interface a consistent identity. Field labels, monetary values and operational text remain in the existing sans-serif family. A typographic gold assay symbol replaces the sign-in screen's illustrative dashboard preview. No external visual assets, paid templates or subscriptions were purchased.

## Boundaries

This is a fictional dealer demo. No ratings, accreditations, testimonials, market depth or transaction functionality are invented. It is not possible to guarantee that any design is unique across the entire web or to prove that AI was never involved. The README continues to disclose AI assistance.

## Verification

Existing browser tests exercise charts, accessibility and responsive layouts, sale/release, stock correction, buy-back receipt and premium propagation. The mobile test now also verifies modal opening, draft preservation, Escape and focus restoration. Typecheck and production build are required before publishing.
