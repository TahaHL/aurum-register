# Aurum Register Design Spec

Hand this file to Codex. Put it in the repo root as `DESIGN.md` and start the session with the prompt below.

## Prompt for Codex

> Restyle Aurum Register to follow `DESIGN.md` exactly. Do not change business logic, API routes or tests. Replace the current fonts, colours and layout with the tokens and layouts in this file. Remove anything listed under "Banned patterns". Work page by page in this order: app shell, price header and chart, inventory, quote builder, customer quote page, activity log. After each page, run the existing tests and take a screenshot at 1440px and 390px wide. Use only the fonts, colours, radii and spacing defined here. If something is not covered, pick the closest existing token rather than inventing a new one.

---

## 1. Direction

**One line:** a dealer's ledger, not a crypto app. Calm, warm, precise, with gold used sparingly like it is expensive.

What we are borrowing, and from where:

| Reference                | What we take                                                                                                                                                                                                           | What we leave                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| BullionByPost            | Price-first page: metal symbol, big price, change, week high and low, then a row of period chips (Live, Today, Week, Month, Year) and unit toggles (g / oz / kg), with the chart directly under. Dark nav, light page. | Their dense mega-menus and marketing clutter. |
| Robinhood (2024 rebrand) | A serif for headlines on a warm near-black rather than pure black, and a monospaced face with tabular figures for every price and percent.                                                                             | The neon lime. Gold replaces it.              |
| Stripe                   | Quiet headings, small UI labels at 13 to 14px, crisp tables, very soft layered shadows.                                                                                                                                | The purple gradients.                         |
| Wise                     | One accent colour used with discipline, pill buttons, big confident numbers.                                                                                                                                           | The lime and the giant 900-weight type.       |
| The Royal Mint           | Gold, silver, black and white as the core identity of a precious-metals brand.                                                                                                                                         | Heritage ornament.                            |

## 2. Fonts

All free, on Google Fonts and npm. None of them is Inter, Roboto, Poppins or Space Grotesk, which are the usual AI defaults.

| Role    | Font               | Weights       | Use for                                                                |
| ------- | ------------------ | ------------- | ---------------------------------------------------------------------- |
| Display | **Source Serif 4** | 400, 600      | Page titles, the big price, section headings, the customer quote total |
| UI      | **Geist**          | 400, 500, 600 | Navigation, buttons, labels, body copy, table text                     |
| Numbers | **Geist Mono**     | 400, 500      | Every price, weight, percentage, timestamp, quote ID, SKU              |

Install:

```bash
npm i @fontsource-variable/source-serif-4 @fontsource-variable/geist @fontsource-variable/geist-mono
```

```css
:root {
  --font-display: "Source Serif 4 Variable", Georgia, serif;
  --font-ui: "Geist Variable", system-ui, sans-serif;
  --font-num: "Geist Mono Variable", ui-monospace, monospace;
}
.num {
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums slashed-zero;
}
```

Rules:

- Every number that can change must use `.num` so digits do not jump when prices tick.
- The big price uses `--font-display` at 56px weight 400 with `font-variant-numeric: tabular-nums lining-nums`. This is the one exception to the mono rule.
- Headings: letter-spacing `-0.01em`. Body: normal. Small caps labels: `0.06em`, uppercase, 11px, weight 500.
- Never use more than these three families.

### Type scale

| Token       | Size / line height | Font    | Weight         |
| ----------- | ------------------ | ------- | -------------- |
| `--t-price` | 56 / 60            | Display | 400            |
| `--t-h1`    | 36 / 42            | Display | 400            |
| `--t-h2`    | 24 / 30            | Display | 600            |
| `--t-h3`    | 18 / 24            | UI      | 600            |
| `--t-body`  | 15 / 22            | UI      | 400            |
| `--t-small` | 13 / 18            | UI      | 400            |
| `--t-label` | 11 / 14            | UI      | 500, uppercase |
| `--t-num`   | 14 / 20            | Mono    | 500            |

Mobile (under 640px): price 40, h1 28, h2 20. Everything else stays.

## 3. Colour

Contrast checked. Every text pairing below passes WCAG AA (4.5:1 or better).

```css
:root {
  /* Surfaces */
  --ink: #16130e; /* warm near-black: nav, primary text, dark panels */
  --ink-2: #24201a; /* raised surface on dark */
  --paper: #faf8f3; /* page background, warm off-white */
  --card: #ffffff; /* cards, tables, inputs */
  --line: #e7e2d7; /* borders, dividers, chart grid */
  --line-dark: #3a342b; /* borders on dark surfaces */

  /* Text */
  --text: #16130e; /* 17.4:1 on paper */
  --text-muted: #6b6457; /* 5.5:1 on paper, 5.9:1 on white */
  --text-on-ink: #faf8f3;
  --text-on-ink-muted: #a8a397; /* 7.4:1 on ink */

  /* Gold: the only accent */
  --gold: #c9a24a; /* fills, chart line on dark, buttons on dark. Text on it: --ink (7.7:1) */
  --gold-text: #8a6418; /* gold text or icons on light surfaces (5.4:1 on white) */
  --gold-tint: #f4ecd8; /* selected chip, highlighted row */

  /* Silver: secondary metal, used only for silver products */
  --silver: #9ca3ab;

  /* Status */
  --up: #1e7b4f; /* price rise, success, accepted (5.3:1 on white) */
  --up-tint: #e3f1e9;
  --down: #b4342d; /* price fall, error, expired (6.1:1 on white) */
  --down-tint: #f7e3e1;
  --stale: #8f5200; /* stale price, warning, reserved */
  --stale-tint: #fff4e0; /* 5.7:1 with --stale text */
}
```

Rules:

- Gold appears at most **once per panel**: the primary button, the selected chip, or the chart line. Never all three in one place.
- Up and down colours are only for price movement and quote status. Never decorative.
- Never use pure `#000` or `#fff` for text. Never use gradients. Never use purple, teal or neon.
- Dark mode is optional for v1. If added, swap paper to `--ink`, card to `--ink-2`, line to `--line-dark`, and use `--gold` instead of `--gold-text`.

## 4. Spacing, shape, depth

```css
:root {
  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 24px;
  --s-6: 32px;
  --s-7: 48px;
  --s-8: 64px;

  --r-sm: 6px; /* inputs, small tags */
  --r-md: 10px; /* cards, tables */
  --r-pill: 999px; /* buttons, chips */

  --shadow-1:
    0 1px 2px rgba(22, 19, 14, 0.06), 0 1px 1px rgba(22, 19, 14, 0.04);
  --shadow-2:
    0 8px 24px -8px rgba(22, 19, 14, 0.14), 0 2px 4px rgba(22, 19, 14, 0.05);

  --page-max: 1240px;
}
```

- Cards: white, 1px `--line` border, `--r-md`, `--shadow-1`. Use `--shadow-2` only for popovers and the chart tooltip.
- Grid: 12 columns, 24px gutters on desktop, 16px side padding on mobile.
- Buttons are pills, 40px tall (44px on mobile). Inputs are 40px tall with `--r-sm`.

## 5. Components

**Primary button:** `--ink` background, `--text-on-ink` text, pill. On dark panels: `--gold` background, `--ink` text.
**Secondary button:** transparent, 1px `--line` border, `--text`. Hover: border `--text-muted`.
**Danger button:** transparent, `--down` text and border. Fills `--down` only on the confirm step.

**Chip (period / unit toggle):** 32px pill, `--t-small` weight 500, `--text-muted`. Selected: `--gold-tint` background, `--gold-text` text. Group chips in a segmented row with 4px gap, like BullionByPost's Live / Today / Week / Month row.

**Price change pill:** `.num`, 13px, `▲ £21.86 (0.70%)` in `--up` on `--up-tint`, or `▼` in `--down` on `--down-tint`. Always show the arrow so it works without colour.

**Status tag:** 22px tall, `--r-sm`, label style.

- Draft: `--line` bg, `--text-muted`
- Sent: `--gold-tint`, `--gold-text`
- Reserved: `--stale-tint`, `--stale`
- Accepted: `--up-tint`, `--up`
- Expired / Cancelled: `--down-tint`, `--down`

**Stale price banner:** full-width strip under the price header, `--stale-tint` background, `--stale` text, clock icon: "Price feed delayed. Last update 14:02:31. Quotes are paused." Only appears when the feed is stale.

**Table:** white card, header row in label style with `--text-muted`, 48px rows, 1px `--line` dividers, numbers right-aligned in `.num`. Hover row: `--paper`. No zebra stripes.

**Countdown (quote expiry):** `.num` `04:59` with a 2px progress bar under it. Bar is `--gold` until 60 seconds left, then `--stale`, then `--down` at zero.

**Icons:** Lucide, 1.5px stroke, 16px in UI, 20px in nav. No emoji anywhere.

## 6. Layouts

### 6.1 App shell (all dealer pages)

```
┌───────────────────────────────────────────────────────────────┐
│ INK NAV  Aurum Register   Prices  Quotes  Inventory  Activity     │
│                                   Au £3,152.85 ▲0.70%   [TH ▾]  │
├───────────────────────────────────────────────────────────────┤
│ PAPER                                                           │
│   Page title (serif h1)                       [Primary action]  │
│   ───────────────────────────────────────────────────────────   │
│   Content (max 1240px, centred)                                 │
└───────────────────────────────────────────────────────────────┘
```

- Nav: 64px, `--ink`, wordmark in Source Serif 4 600 with a small gold square before it. Links in Geist 500 14px `--text-on-ink-muted`, active link `--text-on-ink` with a 2px gold underline.
- A live mini ticker sits on the right of the nav on every page so the price is always visible.
- Mobile: nav collapses to wordmark + ticker + menu button. Bottom tab bar with 4 icons.

### 6.2 Prices page (the BullionByPost-style hero)

```
┌──────────────────────────────── card ─────────────────────────┐
│ [Au] GOLD SPOT · GBP PER TROY OZ          Updated 14:02:31 ●   │
│ £3,152.85        ▲ £21.86 (0.70%)                              │
│ Week high £3,183.45   Week low £3,082.66                       │
│                                                                 │
│ [Live][Today][Week][Month][Year]          [g][oz][kg]  [GBP]   │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │                     chart, 360px tall                        ││
│ └─────────────────────────────────────────────────────────────┘│
│ Showing 214 observations collected since 13 Oct 23:40          │
└─────────────────────────────────────────────────────────────────┘
┌ Spot per gram ┐ ┌ Spot per kg ┐ ┌ Open quotes ┐ ┌ Reserved stock ┐
│ £101.37       │ │ £101,367    │ │ 6           │ │ 3 items        │
└───────────────┘ └─────────────┘ └─────────────┘ └────────────────┘
```

- `[Au]` is a 40px rounded square, `--gold-tint` bg, `--gold-text` serif "Au".
- The green dot after "Updated" pulses gently when live. It turns `--stale` with no pulse when stale.
- Chart rules:
  - Line 2px `--ink` (or `--gold` on dark), with a very faint area fill: `--gold` at 8% opacity fading to 0.
  - Horizontal grid lines only, 1px `--line`, 4 or 5 of them. Y labels right-aligned in `.num` 12px `--text-muted`. X labels in 12px Geist.
  - Hover: vertical 1px `--text-muted` crosshair, a 6px dot on the line, tooltip card with time and price in `.num`.
  - Dashed horizontal reference line at the period's open price, labelled "Open £3,130.99" at the left.
  - If there is not enough history for the selected range, draw only what exists and show the caption "Collected since …". Never fill gaps with invented data.
  - Use a real time axis (Lightweight Charts by TradingView, or Recharts with a time scale). Points must be placed by timestamp, not by index.
- Stat tiles below: 4 across on desktop, 2 by 2 on mobile. Label in label style, value in `.num` 20px.

### 6.3 Quote builder (two columns)

```
┌──── Build quote (8 cols) ──────────────┐ ┌── Summary (4 cols, sticky) ──┐
│ Customer   [ search or add        ]    │ │ QUOTE Q-0142   Draft         │
│                                         │ │                              │
│ Items                                   │ │ 2 × 1oz Britannia  £6,508.40 │
│ ┌─ product card ─┐ ┌─ product card ─┐  │ │ 1 × 20g Bar        £2,087.12 │
│ │ img  1oz Brit. │ │ img  20g Bar   │  │ │ ──────────────────────────── │
│ │ 31.10g · 999.9 │ │ 20.00g · 999.9 │  │ │ Spot used   £3,152.85 /oz    │
│ │ £3,254.20  [+] │ │ £2,087.12  [+] │  │ │ Locked at   14:02:31         │
│ └────────────────┘ └────────────────┘  │ │                              │
│                                         │ │ Total (serif 36)  £8,595.52  │
│ Premium   [ 3.5 % ]   Valid for [5 min] │ │ [ Send quote ]  (primary)    │
└─────────────────────────────────────────┘ └──────────────────────────────┘
```

- Product cards: white, image area 4:3 on `--paper`, name in Geist 600, weight and purity in `.num` `--text-muted`, price in `.num` 16px. Out of stock: image at 40% opacity and a "Reserved" or "Sold out" tag.
- Summary card is sticky at `top: 88px`. On mobile it becomes a bottom sheet showing only the total and the Send button until expanded.

### 6.4 Customer quote page (public link)

Simple, centred, 560px wide, no dealer nav.

```
            Aurum Register (serif wordmark)
   ┌───────────────────────────────────────┐
   │ Quote Q-0142 for Daniel                │
   │ Expires in  04:59  ▬▬▬▬▬▬▬▬▬▬░░        │
   │ ───────────────────────────────────── │
   │ items list, numbers right-aligned       │
   │ ───────────────────────────────────── │
   │ Total             £8,595.52 (serif)    │
   │ Price locked at £3,152.85/oz, 14:02:31 │
   │ [ Accept quote ]  full width, primary   │
   │ Decline                                 │
   └───────────────────────────────────────┘
```

After accept: the card swaps to an `--up-tint` confirmation with a check icon and "Reserved until 15:02". After expiry: the button disables and a `--down-tint` notice says "This quote expired at 14:07. Ask the dealer for a new one."

### 6.5 Inventory

Table view by default, card grid toggle. Columns: Item, Metal, Weight (g), Purity, Fine weight (g), Qty available, Reserved, Value at spot, Actions. Filters as chips above the table: All, Gold, Silver, Coins, Bars, Low stock. Receive stock opens a right-side drawer (480px), not a modal.

### 6.6 Activity log

A single-column timeline inside a card. Each row: time in `.num` `--text-muted` on the left (80px column), a 8px dot coloured by event type, then "**Taha** accepted quote **Q-0142**" in body text, with a small "View" link. Group by day with a sticky date header in label style.

## 7. Motion

- 150ms ease-out for hover and chip changes. 220ms for drawers.
- When the price ticks, flash the price background `--up-tint` or `--down-tint` for 600ms, then fade. Do not animate the digits.
- Respect `prefers-reduced-motion`: no pulse, no flash.

## 8. Banned patterns (these read as AI-generated)

- Inter, Roboto, Poppins, Montserrat, Space Grotesk, DM Sans
- Purple or blue-to-purple gradients, glassmorphism, glowing borders, neon accents
- Emoji in UI or headings
- Every card having an icon in a coloured circle
- Three identical feature cards in a row with an icon, title and two lines
- Big rounded 24px+ corners on everything
- Centred hero text with a gradient headline
- Fake sparkline or chart data, decorative charts not tied to timestamps
- "Welcome back!" or exclamation marks in UI copy
- Em dashes in UI copy

## 9. Copy tone

Short, factual, dealer language. "Spot", "premium", "fine weight", "locked at", "reserved until". Sentence case for everything. Times in 24-hour `14:02:31`, dates as `14 Oct 2026`, currency as `£3,152.85`.

## 10. Done checklist for Codex

- [ ] Only Source Serif 4, Geist and Geist Mono are loaded
- [ ] All colours come from the tokens in section 3
- [ ] Every changing number uses `.num` with tabular figures
- [ ] Chart x axis is a real time scale and shows only collected data
- [ ] Gold used once per panel at most
- [ ] Stale state visible on price header, ticker and quote builder
- [ ] Layouts checked at 1440px, 1024px and 390px
- [ ] Keyboard focus ring: 2px `--gold-text` outline, 2px offset, on every interactive element
- [ ] Existing tests still pass
