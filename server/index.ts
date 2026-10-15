import { seedStoreOrders } from "./seed-store-orders.js";
import { Catalogue } from "./catalogue.js";
import { seedCatalogue } from "./catalogue.js";
import { openDatabase } from "./database.js";
import { migrate, seed } from "./migrate.js";
import {
  PriceFeed,
  fixtureProvider,
  goldApiProvider,
  publicGoldProvider,
} from "./prices.js";
import { MetalMarkets } from "./metals.js";
import { PriceHistoryStore } from "./price-history.js";
import type { PriceSnapshot } from "../shared/types.js";
import { Ledger } from "./ledger.js";
import { createApp } from "./app.js";
import { authOptions, seedDemoUsers } from "./auth.js";
const origin =
  process.env.APP_ORIGIN ||
  process.env.RENDER_EXTERNAL_URL ||
  `http://127.0.0.1:${process.env.CLIENT_PORT || 5187}`;
const authentication = authOptions(origin);
const database = await openDatabase();
await migrate(database.pool);
await seed(database.pool);
if (authentication.demoAccounts) await seedDemoUsers(database.pool);
const provider = process.env.PRICE_PROVIDER || "public-gold";
if (!["fixture", "goldapi", "public-gold"].includes(provider))
  throw Error("Unknown PRICE_PROVIDER");
const priceHistory = new PriceHistoryStore(
  database.pool,
  provider as PriceSnapshot["source"],
);
const feed = new PriceFeed(
  provider === "goldapi"
    ? goldApiProvider(process.env.GOLDAPI_KEY || "")
    : provider === "public-gold"
      ? publicGoldProvider()
      : fixtureProvider(),
  Date.now,
  120000,
  (snapshot) => priceHistory.append(snapshot),
);
const markets = new MetalMarkets(
  database.pool,
  feed,
  priceHistory,
  provider === "fixture",
);
await markets.refresh();
await seedCatalogue(database.pool, markets);
if (authentication.demoAccounts)
  await seedStoreOrders(new Catalogue(database.pool, markets));
const ledger = new Ledger(database.pool, feed);
await ledger.releaseExpired();
const { app, broadcast, closeStreams } = createApp(
  ledger,
  feed,
  origin,
  database.kind,
  authentication,
  priceHistory,
  markets,
);
const server = app.listen(
  Number(process.env.PORT || 3107),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      `Aurum Register API ready: http://127.0.0.1:${process.env.PORT || 3107} · ${database.kind} · fictional demo`,
    ),
);
let sweeping = false;
const priceTimer = setInterval(() => {
  void markets.refresh().then(broadcast);
}, 30000);
const reservationTimer = setInterval(() => {
  if (sweeping) return;
  sweeping = true;
  void ledger
    .releaseExpired()
    .catch((error) =>
      console.error({
        event: "reservation.cleanup.failed",
        message: String(error),
      }),
    )
    .finally(() => {
      sweeping = false;
    });
}, 5000);
const sessionTimer = setInterval(() => {
  void priceHistory.prune().catch((error) =>
    console.error({
      event: "price.history.cleanup.failed",
      message: String(error),
    }),
  );
  void ledger.pool
    .query("DELETE FROM dealer_sessions WHERE expires_at<=now()")
    .catch((error) =>
      console.error({
        event: "session.cleanup.failed",
        message: String(error),
      }),
    );
}, 60000);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(priceTimer);
  clearInterval(reservationTimer);
  clearInterval(sessionTimer);
  closeStreams();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await database.close();
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
