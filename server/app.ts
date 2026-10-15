import { installStoreAdmin } from "./store-admin.js";
import { installShop } from "./shop.js";
import { Catalogue } from "./catalogue.js";
import type { MetalMarkets } from "./metals.js";
import { METALS } from "../shared/types.js";
import express from "express";
import helmet from "helmet";
import { createApiLimits } from "./rate-limits.js";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z, ZodError } from "zod";
import { Ledger } from "./ledger.js";
import { PriceFeed } from "./prices.js";
import { HttpError } from "./errors.js";
import { installAuth, authOptions, type AuthOptions } from "./auth.js";
import type { DealerUser } from "../shared/types.js";
import type { PriceHistoryStore } from "./price-history.js";
import { PRICE_RANGES } from "../shared/chart.js";
const createSchema = z
  .object({
    lotId: z.string().uuid(),
    quantity: z.number().int().min(1).max(100),
    marginBps: z.number().int().min(0).max(2000),
    reference: z.string().trim().min(1).max(80),
  })
  .strict();
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export function createApp(
  ledger: Ledger,
  feed: PriceFeed,
  origin: string,
  databaseKind = "postgresql",
  authentication: AuthOptions = authOptions(origin),
  priceHistory?: PriceHistoryStore,
  markets?: MetalMarkets,
) {
  const app = express();
  const streams = new Set<express.Response>();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "script-src": ["'self'"],
          "style-src": [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          "font-src": ["'self'", "https://fonts.gstatic.com"],
        },
      },
    }),
  );
  app.use((req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader("X-Request-ID", res.locals.requestId);
    next();
  });
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      if (req.get("origin") !== origin)
        return next(new HttpError(403, "Request origin is not allowed."));
      if (!req.is("application/json"))
        return next(new HttpError(415, "Use application/json."));
    }
    next();
  });
  app.use(express.json({ limit: "16kb" }));
  const limits = createApiLimits();
  app.use("/api", limits.reads, limits.writes);
  app.get("/api/health", async (_req, res) => {
    await ledger.pool.query("SELECT 1");
    res.json({ status: "ok", database: databaseKind, mode: "fictional-demo" });
  });
  const { requireDealer } = installAuth(app, ledger.pool, authentication);
  if (markets) {
    const catalogue = new Catalogue(ledger.pool, markets);
    installShop(app, catalogue, authentication.demoAccounts, requireDealer);
    installStoreAdmin(app, catalogue, requireDealer);
    app.get("/api/catalogue", async (req, res) =>
      res.json(await catalogue.list(req.query)),
    );
    app.get("/api/products/:slug", async (req, res) =>
      res.json(
        await catalogue.product(
          String(req.params.slug),
          z.coerce
            .number()
            .int()
            .min(1)
            .max(1000)
            .parse(req.query.qty || 1),
        ),
      ),
    );
  }
  app.get("/api/workspace", requireDealer, async (_req, res) => {
    const workspace = await ledger.workspace(
      (res.locals.user as DealerUser).dealerId,
    );
    if (res.locals.user.role !== "owner")
      workspace.events = workspace.events.filter(
        (e) => !e.type.startsWith("store."),
      );
    res.json(workspace);
  });
  app.get("/api/metals", (_req, res) =>
    res.json(markets?.state() || { XAU: feed.state() }),
  );
  app.get("/api/metals/:metal/history", async (req, res) => {
    const metal = z.enum(METALS).parse(req.params.metal);
    const range = z.enum(PRICE_RANGES).parse(req.query.range || "1d");
    const history =
      markets?.histories[metal] || (metal === "XAU" ? priceHistory : undefined);
    if (!history) throw new HttpError(503, "Metal history is not available.");
    res.json(await history.read(range));
  });
  app.get("/api/price", (_req, res) => res.json(feed.state()));
  app.get("/api/price/history", async (req, res) => {
    const range = z.enum(PRICE_RANGES).parse(req.query.range || "1h");
    if (!priceHistory)
      throw new HttpError(503, "Price history is not available.");
    res.json(await priceHistory.read(range));
  });
  app.post("/api/price/refresh", requireDealer, async (_req, res) => {
    if (markets) await markets.refresh();
    else await feed.refresh();
    broadcast();
    res.json(feed.state());
  });
  app.get("/api/price/stream", limits.stream, (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write("retry: 3000\n\n");
    res.write(`event: price\ndata: ${JSON.stringify(feed.state())}\n\n`);
    res.write(
      `event: metals\ndata: ${JSON.stringify(markets?.state() || { XAU: feed.state() })}\n\n`,
    );
    streams.add(res);
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
    req.on("close", () => {
      clearInterval(heartbeat);
      streams.delete(res);
    });
  });
  app.post("/api/quotes", requireDealer, async (req, res) =>
    res
      .status(201)
      .json(await ledger.create(createSchema.parse(req.body), res.locals.user)),
  );
  app.post("/api/inventory", requireDealer, async (req, res) => {
    res
      .status(201)
      .json({ lot: await ledger.createLot(req.body, res.locals.user) });
  });
  app.post("/api/inventory/:id/adjust", requireDealer, async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    res.json({ lot: await ledger.adjustStock(id, req.body, res.locals.user) });
  });
  app.post(
    "/api/reservations/:id/complete",
    requireDealer,
    async (req, res) => {
      const id = z.uuid().parse(req.params.id);
      res.json({
        reservation: await ledger.completeReservation(
          id,
          req.body,
          res.locals.user,
        ),
      });
    },
  );
  app.post("/api/inventory/:id/premium", requireDealer, async (req, res) => {
    res.json({
      lot: await ledger.setPremium(
        z.uuid().parse(req.params.id),
        req.body,
        res.locals.user,
      ),
    });
  });
  app.post("/api/buybacks", requireDealer, async (req, res) =>
    res
      .status(201)
      .json(await ledger.buybacks.create(req.body, res.locals.user)),
  );
  app.get("/api/buybacks/:id", async (req, res) =>
    res.json({
      buyback: await ledger.buybacks.customer(
        z.uuid().parse(req.params.id),
        tokenSchema.parse(req.query.token),
      ),
    }),
  );
  app.post("/api/buybacks/:id/accept", async (req, res) => {
    const body = z
      .object({ token: tokenSchema, requestId: z.uuid() })
      .strict()
      .parse(req.body);
    res.json({
      buyback: await ledger.buybacks.accept(
        z.uuid().parse(req.params.id),
        body.token,
        body.requestId,
      ),
    });
  });
  app.post("/api/buybacks/:id/complete", requireDealer, async (req, res) =>
    res.json({
      buyback: await ledger.buybacks.complete(
        z.uuid().parse(req.params.id),
        req.body,
        res.locals.user,
      ),
    }),
  );
  app.get("/api/quotes/:id", async (req, res) => {
    const id = z.string().uuid().parse(req.params.id),
      token = tokenSchema.parse(req.query.token);
    res.json({ quote: await ledger.customerQuote(id, token) });
  });
  app.post("/api/quotes/:id/accept", async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({ token: tokenSchema, requestId: z.string().uuid() })
      .strict()
      .parse(req.body);
    res.json({
      reservation: await ledger.accept(id, body.token, body.requestId),
    });
  });
  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "API endpoint not found.")),
  );
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.resolve("dist")));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(path.resolve("dist/index.html")),
    );
  }
  // Four arguments are required by Express to recognise error middleware.
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      let status = 500,
        message =
          "Something went wrong. Try again using the request reference.";
      if (error instanceof HttpError) {
        status = error.status;
        message = error.message;
      } else if (error instanceof ZodError) {
        status = 400;
        message = "Check the form fields and try again.";
      } else if (error instanceof SyntaxError) {
        status = 400;
        message = "Invalid JSON request.";
      } else if (
        typeof error === "object" &&
        error &&
        "status" in error &&
        error.status === 413
      ) {
        status = 413;
        message = "Request is too large.";
      } else if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        error.code === "23505"
      ) {
        status = 409;
        message = "This request has already been used.";
      }
      if (status === 500)
        console.error({
          requestId: res.locals.requestId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      res.status(status).json({ message, requestId: res.locals.requestId });
    },
  );
  function broadcast() {
    for (const response of streams) {
      response.write(`event: price\ndata: ${JSON.stringify(feed.state())}\n\n`);
      response.write(
        `event: metals\ndata: ${JSON.stringify(markets?.state() || { XAU: feed.state() })}\n\n`,
      );
    }
  }
  return {
    app,
    broadcast,
    closeStreams: () => {
      for (const response of streams) response.end();
      streams.clear();
    },
  };
}
