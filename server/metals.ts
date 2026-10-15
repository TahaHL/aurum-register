import type { Metal, MarketState } from "../shared/types.js";
import { METALS } from "../shared/types.js";
import { PriceFeed, fixtureProvider, publicGoldProvider } from "./prices.js";
import { PriceHistoryStore } from "./price-history.js";
import type { SqlPool } from "./sql.js";
export class MetalMarkets {
  private summaries: Partial<
    Record<Metal, Pick<MarketState, "dayOpen" | "firstObservedAt">>
  > = {};
  private summaryDay = "";
  feeds: Record<Metal, PriceFeed>;
  histories: Record<Metal, PriceHistoryStore>;
  constructor(
    pool: SqlPool,
    gold: PriceFeed,
    goldHistory: PriceHistoryStore,
    fixture = false,
  ) {
    this.feeds = { XAU: gold } as Record<Metal, PriceFeed>;
    this.histories = { XAU: goldHistory } as Record<Metal, PriceHistoryStore>;
    for (const metal of METALS.filter((m) => m !== "XAU")) {
      const history = new PriceHistoryStore(
        pool,
        fixture ? "fixture" : "public-gold",
        Date.now,
        metal,
      );
      this.histories[metal] = history;
      this.feeds[metal] = new PriceFeed(
        fixture
          ? fixtureProvider(Date.now, metal)
          : publicGoldProvider(Date.now, fetch, metal),
        Date.now,
        120000,
        (snapshot) => history.append(snapshot),
      );
    }
  }
  state(): Record<Metal, MarketState> {
    const currentDay = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
    }).format(new Date());
    return Object.fromEntries(
      METALS.map((m) => [
        m,
        {
          ...this.feeds[m].state(),
          dayOpen:
            this.summaryDay === currentDay
              ? this.summaries[m]?.dayOpen || null
              : null,
          firstObservedAt: this.summaries[m]?.firstObservedAt || null,
        },
      ]),
    ) as Record<Metal, MarketState>;
  }
  async refresh() {
    await Promise.all(
      METALS.map(async (m) => {
        await this.feeds[m].refresh();
        try {
          this.summaries[m] = await this.histories[m].summary();
        } catch {
          this.summaries[m] = { dayOpen: null, firstObservedAt: null };
        }
      }),
    );
    this.summaryDay = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
    }).format(new Date());
  }
}
