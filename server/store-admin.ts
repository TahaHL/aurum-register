import type { Express, RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Catalogue } from "./catalogue.js";
import { DEMO_DEALER_ID } from "./migrate.js";
import { HttpError } from "./errors.js";
import { priceProduct, validateTiers } from "../shared/pricing.js";
export async function storeReport(
  catalogue: Catalogue,
  from: string,
  to: string,
  expensePerOrder = 750,
) {
  const pool = catalogue.pool;
  const orders = (
    await pool.query(
      `SELECT o.*,c.name customer_name,COALESCE((SELECT jsonb_agg(l.snapshot) FROM order_lines l WHERE l.order_id=o.id),'[]') lines FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.created_at>=$1 AND o.created_at<$2 ORDER BY o.created_at DESC`,
      [from, to],
    )
  ).rows;
  const allocations = (
    await pool.query(
      `SELECT a.*,l.order_id,l.product_id FROM order_allocations a JOIN order_lines l ON l.id=a.order_line_id JOIN orders o ON o.id=l.order_id WHERE o.created_at>=$1 AND o.created_at<$2 AND o.status<>'cancelled'`,
      [from, to],
    )
  ).rows;
  const paid = orders.filter((o) => o.status !== "cancelled");
  const revenuePence = paid.reduce((n, o) => n + Number(o.net_pence), 0),
    vatPence = paid.reduce((n, o) => n + Number(o.vat_pence), 0);
  const unknownCosts = allocations
    .filter((a) => a.unit_cost_pence === null)
    .reduce((n, a) => n + a.quantity, 0);
  const cogsPence = unknownCosts
    ? null
    : allocations.reduce(
        (n, a) => n + a.quantity * Number(a.unit_cost_pence),
        0,
      );
  const grossProfitPence = cogsPence === null ? null : revenuePence - cogsPence,
    expensesPence = paid.length * expensePerOrder;
  const daily: Record<string, { revenuePence: number; orders: number }> = {};
  for (const o of paid) {
    const day = new Date(o.created_at).toISOString().slice(0, 10);
    daily[day] ||= { revenuePence: 0, orders: 0 };
    daily[day].revenuePence += Number(o.net_pence);
    daily[day].orders++;
  }
  const byMetal: Record<string, number> = {},
    byProduct: Record<string, number> = {},
    byCategory: Record<string, number> = {};
  for (const o of paid)
    for (const l of o.lines) {
      byMetal[l.metal] = (byMetal[l.metal] || 0) + l.netPence;
      byProduct[l.name] = (byProduct[l.name] || 0) + l.netPence;
      byCategory[l.category] = (byCategory[l.category] || 0) + l.netPence;
    }
  const inventory = (await catalogue.all(false)).map((p) => catalogue.price(p));
  const costLots = (
    await pool.query(
      "SELECT * FROM lots WHERE product_id IS NOT NULL AND dealer_id=$1 ORDER BY product_id,acquired_at,id",
      [DEMO_DEALER_ID],
    )
  ).rows;
  const stockCostUnknown = costLots.some(
      (l) => l.total_units > 0 && l.unit_cost_pence === null,
    ),
    stockAtCostPence = stockCostUnknown
      ? null
      : costLots.reduce(
          (n, l) => n + l.total_units * Number(l.unit_cost_pence),
          0,
        );
  const stockAtSpotPence = inventory.some((p) => !p.spot)
    ? null
    : inventory.reduce(
        (n, p) =>
          n +
          priceProduct({
            spot: p.spot,
            fineWeightMgPerPack: p.fine_weight_mg_per_pack,
            quantity: 1,
            tiers: [{ minQuantity: 1, premiumBps: 0 }],
          }).unitPence *
            (p.available + p.reserved),
        0,
      );
  const financialOrders = orders.map((o) => {
    const used = allocations.filter((a) => a.order_id === o.id);
    const cost =
      o.status === "cancelled"
        ? 0
        : used.some((a) => a.unit_cost_pence === null)
          ? null
          : used.reduce(
              (n, a) => n + a.quantity * Number(a.unit_cost_pence),
              0,
            );
    return {
      ...o,
      status: String(o.status),
      created_at: o.created_at,
      lines: o.lines,
      allocations: used,
      cogsPence: cost,
      grossProfitPence:
        cost === null
          ? null
          : o.status === "cancelled"
            ? 0
            : Number(o.net_pence) - cost,
    };
  });
  const dailyProfit: Record<string, number | null> = {},
    topProducts: Record<string, number | null> = {},
    stockByMetal: Record<string, number> = {};
  const groups: Record<
    string,
    Record<
      string,
      {
        revenuePence: number;
        cogsPence: number | null;
        grossProfitPence: number | null;
      }
    >
  > = { metal: {}, product: {}, category: {} };
  for (const o of financialOrders.filter((o) => o.status !== "cancelled")) {
    const day = new Date(o.created_at).toISOString().slice(0, 10);
    dailyProfit[day] =
      dailyProfit[day] === null || o.grossProfitPence === null
        ? null
        : (dailyProfit[day] || 0) + o.grossProfitPence;
    for (const l of o.lines) {
      const used = o.allocations.filter((a) => a.product_id === l.productId),
        cost = used.some((a) => a.unit_cost_pence === null)
          ? null
          : used.reduce(
              (n, a) => n + a.quantity * Number(a.unit_cost_pence),
              0,
            );
      topProducts[l.name] =
        topProducts[l.name] === null || cost === null
          ? null
          : (topProducts[l.name] || 0) + l.netPence - cost;
      for (const [dimension, key] of [
        ["metal", l.metal],
        ["product", l.name],
        ["category", l.category],
      ]) {
        const g = (groups[dimension][key] ||= {
          revenuePence: 0,
          cogsPence: 0,
          grossProfitPence: 0,
        });
        g.revenuePence += l.netPence;
        g.cogsPence =
          g.cogsPence === null || cost === null ? null : g.cogsPence + cost;
        g.grossProfitPence =
          g.cogsPence === null ? null : g.revenuePence - g.cogsPence;
      }
    }
  }
  const financialInventory = inventory.map((p) => {
    const lots = costLots.filter((l) => l.product_id === p.id),
      units = p.available + p.reserved,
      cost = lots.some((l) => l.total_units && l.unit_cost_pence === null)
        ? null
        : lots.reduce(
            (n, l) => n + l.total_units * Number(l.unit_cost_pence),
            0,
          ),
      spot = p.spot
        ? priceProduct({
            spot: p.spot,
            fineWeightMgPerPack: p.fine_weight_mg_per_pack,
            quantity: 1,
            tiers: [{ minQuantity: 1, premiumBps: 0 }],
          }).unitPence * units
        : null;
    if (spot !== null)
      stockByMetal[p.metal] = (stockByMetal[p.metal] || 0) + spot;
    return {
      ...p,
      stockAtCostPence: cost,
      averageCostPence:
        cost === null || !units ? null : Math.round(cost / units),
      stockAtSpotPence: spot,
      unrealisedPence: cost === null || spot === null ? null : spot - cost,
    };
  });
  const reservations = (
    await pool.query(
      "SELECT r.id,r.quantity,r.expires_at,l.name FROM reservations r JOIN lots l ON l.id=r.lot_id WHERE r.dealer_id=$1 AND r.status='held' ORDER BY r.expires_at",
      [DEMO_DEALER_ID],
    )
  ).rows;
  return {
    orders,
    inventory,
    costLots,
    financialOrders,
    financialInventory,
    dailyProfit,
    topProducts,
    stockByMetal,
    groups,
    reservations,
    expensePerOrder,
    summary: {
      revenuePence,
      vatPence,
      orderCount: paid.length,
      cogsPence,
      grossProfitPence,
      expensesPence,
      netPence:
        grossProfitPence === null ? null : grossProfitPence - expensesPence,
      marginPercent:
        grossProfitPence === null || !revenuePence
          ? null
          : (grossProfitPence / revenuePence) * 100,
      unknownCosts,
      stockAtCostPence,
      stockAtSpotPence,
      unrealisedPence:
        stockAtCostPence === null || stockAtSpotPence === null
          ? null
          : stockAtSpotPence - stockAtCostPence,
    },
    daily,
    byMetal,
    byProduct,
    byCategory,
  };
}
export function installStoreAdmin(
  app: Express,
  catalogue: Catalogue,
  requireDealer: RequestHandler,
) {
  const pool = catalogue.pool;
  const access: RequestHandler = (req, res, next) => {
    if (res.locals.user.dealerId !== DEMO_DEALER_ID)
      return next(new HttpError(404, "Store not found"));
    next();
  };
  const owner: RequestHandler = (req, res, next) =>
    res.locals.user.role === "owner"
      ? next()
      : next(new HttpError(403, "Owner access required."));
  const expense = (query: any) =>
    z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .default(750)
      .parse(query.expensePence);
  const range = (query: any) => {
    const q = z
      .object({
        days: z.coerce.number().int().min(1).max(3650).default(30),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
      })
      .parse(query);
    const from = q.from
        ? new Date(q.from)
        : new Date(Date.now() - q.days * 86400000),
      to = q.to ? new Date(new Date(q.to).getTime() + 86400000) : new Date();
    if (from >= to) throw new HttpError(400, "Invalid date range");
    return [from.toISOString(), to.toISOString()] as const;
  };
  app.get("/api/admin/store", requireDealer, access, async (req, res) => {
    const [from, to] = range(req.query);
    const r = await storeReport(catalogue, from, to, expense(req.query));
    if (res.locals.user.role === "owner")
      return res.json({
        ...r,
        orders: r.financialOrders,
        inventory: r.financialInventory,
        role: "owner",
        from,
        to,
      });
    // Explicit allow-list: staff never receive cost or derived profit fields.
    res.json({
      role: "staff",
      from,
      to,
      orders: r.orders,
      inventory: r.inventory,
      summary: {
        orderCount: r.summary.orderCount,
        revenuePence: r.summary.revenuePence,
        vatPence: r.summary.vatPence,
      },
      daily: r.daily,
      byMetal: r.byMetal,
      reservations: r.reservations,
    });
  });
  app.get(
    "/api/admin/pnl.csv",
    requireDealer,
    access,
    owner,
    async (req, res) => {
      const [from, to] = range(req.query),
        r = await storeReport(catalogue, from, to, expense(req.query));
      res
        .type("text/csv")
        .attachment("hlm-demo-profit-loss.csv")
        .send(
          "metric,pence\n" +
            Object.entries(r.summary)
              .filter(([k]) => k.endsWith("Pence"))
              .map(([k, v]) => `${k},${v === null ? "unknown" : v}`)
              .join("\n"),
        );
    },
  );
  app.get("/api/admin/customers", requireDealer, access, async (req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT c.id,c.name,c.email,count(o.id)::int orders,COALESCE(sum(o.total_pence) FILTER(WHERE o.status<>'cancelled'),0) lifetime_pence FROM customers c LEFT JOIN orders o ON o.customer_id=c.id GROUP BY c.id ORDER BY c.created_at DESC LIMIT 200",
        )
      ).rows,
    ),
  );
  app.get("/api/admin/activity", requireDealer, access, async (req, res) => {
    const q = z
      .object({ type: z.string().max(100).default("") })
      .parse(req.query);
    const rows = (
      await pool.query(
        `SELECT id,type,created_at ${res.locals.user.role === "owner" ? ",details" : ""} FROM ledger_events WHERE dealer_id=$1 AND type LIKE $2 ORDER BY created_at DESC LIMIT 200`,
        [DEMO_DEALER_ID, "%" + q.type + "%"],
      )
    ).rows;
    res.json(rows);
  });
  app.post(
    "/api/admin/products/:id",
    requireDealer,
    access,
    owner,
    async (req, res) => {
      const id = z.uuid().parse(req.params.id),
        b = z
          .object({
            tiers: z
              .array(
                z.object({ minQuantity: z.number(), premiumBps: z.number() }),
              )
              .min(1)
              .max(20),
            buybackDiscountBps: z.number().int().min(0).max(10000),
            published: z.boolean(),
            tags: z
              .array(z.enum(["best-seller", "new-release", "pre-owned"]))
              .max(3),
            lowStockThreshold: z.number().int().min(0).max(10000),
          })
          .strict()
          .parse(req.body);
      validateTiers(b.tiers);
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const r = await c.query(
          "UPDATE products SET buyback_discount_bps=$2,published=$3,tags=$4,low_stock_threshold=$5 WHERE id=$1 AND dealer_id=$6 RETURNING id",
          [
            id,
            b.buybackDiscountBps,
            b.published,
            b.tags,
            b.lowStockThreshold,
            DEMO_DEALER_ID,
          ],
        );
        if (!r.rowCount) throw new HttpError(404, "Product not found");
        await c.query("DELETE FROM product_price_tiers WHERE product_id=$1", [
          id,
        ]);
        for (const t of b.tiers)
          await c.query("INSERT INTO product_price_tiers VALUES($1,$2,$3)", [
            id,
            t.minQuantity,
            t.premiumBps,
          ]);
        await c.query(
          "INSERT INTO ledger_events(id,dealer_id,type,details) VALUES($1,$2,$3,$4)",
          [
            randomUUID(),
            DEMO_DEALER_ID,
            "store.product.updated",
            JSON.stringify({ productId: id, actor: res.locals.user.id, ...b }),
          ],
        );
        await c.query("COMMIT");
        res.json({ ok: true });
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    },
  );
  app.post(
    "/api/admin/receive",
    requireDealer,
    access,
    owner,
    async (req, res) => {
      const b = z
        .object({
          productId: z.uuid(),
          quantity: z.number().int().min(1).max(10000),
          unitCostPence: z.number().int().min(0).max(1000000000),
          supplierReference: z.string().trim().min(3).max(120),
          requestId: z.uuid(),
        })
        .strict()
        .parse(req.body);
      const p = (await catalogue.all(false)).find((p) => p.id === b.productId);
      if (!p) throw new HttpError(404, "Product not found");
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const r = await c.query(
          `INSERT INTO lots(id,dealer_id,sku,name,description,weight_mg,fineness,total_units,default_premium_bps,metal,product_id,unit_cost_pence,source,supplier_reference) VALUES($1,$2,$3,$4,'Fictional received stock',$5,$6,$7,300,$8,$9,$10,'supplier',$11) ON CONFLICT(id) DO NOTHING RETURNING id`,
          [
            b.requestId,
            DEMO_DEALER_ID,
            "RECEIPT-" + b.requestId,
            p.name,
            Math.min(p.gross_weight_mg_per_unit, 1000000),
            p.fineness,
            b.quantity,
            p.metal,
            p.id,
            b.unitCostPence,
            b.supplierReference,
          ],
        );
        if (r.rowCount)
          await c.query(
            "INSERT INTO ledger_events(id,dealer_id,type,details) VALUES($1,$2,$3,$4)",
            [
              randomUUID(),
              DEMO_DEALER_ID,
              "store.stock.received",
              JSON.stringify({ ...b, actor: res.locals.user.id }),
            ],
          );
        await c.query("COMMIT");
        res.json({ ok: true });
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    },
  );
}
