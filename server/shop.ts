import type { Express, Request, RequestHandler } from "express";
import { randomUUID, randomBytes } from "node:crypto";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { Catalogue } from "./catalogue.js";
import { HttpError } from "./errors.js";
import { hashPassword, verifyPassword } from "./auth.js";
import { DEMO_DEALER_ID } from "./migrate.js";
import type { DealerUser } from "../shared/types.js";
declare module "express-session" {
  interface SessionData {
    customerId?: string;
    shopId?: string;
  }
}
export class Shop {
  constructor(
    public catalogue: Catalogue,
    private clock = Date.now,
  ) {}
  async basket(sid: string) {
    const { rows } = await this.catalogue.pool.query(
      "SELECT * FROM basket_lines WHERE session_id=$1",
      [sid],
    );
    const products = await this.catalogue.all();
    return rows
      .map((line) => {
        const p = products.find((p) => p.id === line.product_id);
        return p
          ? {
              ...this.catalogue.price(p, line.quantity),
              quantity: line.quantity,
            }
          : null;
      })
      .filter(Boolean);
  }
  async lock(sid: string, customerId: string) {
    const basket = await this.basket(sid);
    if (!basket.length) throw new HttpError(400, "Your basket is empty.");
    if (
      basket.some((p: any) => p.stale || !p.pricing || p.available < p.quantity)
    )
      throw new HttpError(
        409,
        "A price is stale or stock is unavailable. Review your basket.",
      );
    const lines = basket.map((p: any) => ({
      productId: p.id,
      name: p.name,
      metal: p.metal,
      category: p.category,
      quantity: p.quantity,
      spot: p.spot,
      source: p.source,
      priceAt: p.priceAt,
      tier: p.pricing.tier,
      unitPence: p.pricing.unitPence,
      netPence: p.pricing.linePence,
      vatPence: p.pricing.vatPence,
      totalPence: p.pricing.totalPence,
      buybackPence: p.buybackPence,
    }));
    const netPence = lines.reduce((n, l) => n + l.netPence, 0),
      vatPence = lines.reduce((n, l) => n + l.vatPence, 0),
      id = randomUUID(),
      expiresAt = new Date(this.clock() + 600000).toISOString();
    await this.catalogue.pool.query(
      "INSERT INTO checkout_locks(id,customer_id,session_id,lines,net_pence,vat_pence,total_pence,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        customerId,
        sid,
        JSON.stringify(lines),
        netPence,
        vatPence,
        netPence + vatPence,
        expiresAt,
      ],
    );
    return {
      id,
      requestId: randomUUID(),
      lines,
      netPence,
      vatPence,
      totalPence: netPence + vatPence,
      expiresAt,
    };
  }
  async place(customerId: string, lockId: string, requestId: string) {
    const c = await this.catalogue.pool.connect();
    try {
      await c.query("BEGIN");
      // Serialise retries for this customer before taking stock locks.
      await c.query("SELECT id FROM customers WHERE id=$1 FOR UPDATE", [
        customerId,
      ]);
      const previous = await c.query(
        "SELECT * FROM orders WHERE customer_id=$1 AND (request_id=$2 OR lock_id=$3)",
        [customerId, requestId, lockId],
      );
      if (previous.rows[0]) {
        if (
          previous.rows[0].request_id === requestId &&
          previous.rows[0].lock_id !== lockId
        )
          throw new HttpError(
            409,
            "Request ID already belongs to another checkout.",
          );
        await c.query("COMMIT");
        return previous.rows[0];
      }
      const lock = (
        await c.query(
          "SELECT * FROM checkout_locks WHERE id=$1 AND customer_id=$2",
          [lockId, customerId],
        )
      ).rows[0];
      if (!lock) throw new HttpError(404, "Price lock not found.");
      if (new Date(lock.expires_at).getTime() <= this.clock())
        throw new HttpError(
          409,
          "Price lock expired. Refresh prices and review the new total before placing your order.",
        );
      const ids = lock.lines.map((l: any) => l.productId).sort();
      // Global FIFO lock order is shared by checkout and cancellation. Holds remain unavailable.
      const lots = (
        await c.query(
          "SELECT * FROM lots WHERE product_id=ANY($1::uuid[]) ORDER BY product_id,acquired_at,id FOR UPDATE",
          [ids],
        )
      ).rows;
      if (new Date(lock.expires_at).getTime() <= this.clock())
        throw new HttpError(
          409,
          "Price lock expired while waiting for stock. Refresh and review prices.",
        );
      const orderId = randomUUID();
      await c.query(
        "INSERT INTO orders(id,customer_id,lock_id,request_id,status,net_pence,vat_pence,total_pence) VALUES($1,$2,$3,$4,'paid_simulated',$5,$6,$7)",
        [
          orderId,
          customerId,
          lockId,
          requestId,
          lock.net_pence,
          lock.vat_pence,
          lock.total_pence,
        ],
      );
      for (const line of lock.lines) {
        let remaining = line.quantity;
        const lineId = randomUUID();
        await c.query(
          "INSERT INTO order_lines(id,order_id,product_id,quantity,snapshot) VALUES($1,$2,$3,$4,$5)",
          [
            lineId,
            orderId,
            line.productId,
            line.quantity,
            JSON.stringify(line),
          ],
        );
        for (const lot of lots.filter((l) => l.product_id === line.productId)) {
          const take = Math.min(
            remaining,
            lot.total_units - lot.reserved_units,
          );
          if (take <= 0) continue;
          await c.query(
            "UPDATE lots SET total_units=total_units-$2 WHERE id=$1",
            [lot.id, take],
          );
          await c.query("INSERT INTO order_allocations VALUES($1,$2,$3,$4)", [
            lineId,
            lot.id,
            take,
            lot.unit_cost_pence,
          ]);
          remaining -= take;
          if (!remaining) break;
        }
        if (remaining)
          throw new HttpError(
            409,
            "Stock changed while you were checking out. No order was placed.",
          );
      }
      await c.query(
        "INSERT INTO ledger_events(id,dealer_id,type,details) VALUES($1,$2,$3,$4)",
        [
          randomUUID(),
          DEMO_DEALER_ID,
          "store.order.paid_simulated",
          JSON.stringify({
            orderId,
            customerId,
            totalPence: Number(lock.total_pence),
          }),
        ],
      );
      await c.query("DELETE FROM basket_lines WHERE session_id=$1", [
        lock.session_id,
      ]);
      await c.query("COMMIT");
      return {
        id: orderId,
        status: "paid_simulated",
        total_pence: lock.total_pence,
      };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async transition(id: string, status: string, user: DealerUser) {
    if (status === "cancelled" && user.role !== "owner")
      throw new HttpError(403, "Only owners may cancel an order.");
    const c = await this.catalogue.pool.connect();
    try {
      await c.query("BEGIN");
      const order = (
        await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      if (!order || user.dealerId !== DEMO_DEALER_ID)
        throw new HttpError(404, "Order not found.");
      if (order.status === status) {
        await c.query("COMMIT");
        return order;
      }
      if (!(
        (order.status === "paid_simulated" &&
          ["dispatched", "cancelled"].includes(status)) ||
        (order.status === "dispatched" && status === "delivered")
      ))
        throw new HttpError(409, "Invalid order status transition.");
      if (status === "cancelled") {
        const allocations = (
          await c.query(
            "SELECT a.* FROM order_allocations a JOIN order_lines l ON l.id=a.order_line_id WHERE l.order_id=$1",
            [id],
          )
        ).rows;
        await c.query(
          "SELECT id FROM lots WHERE id=ANY($1::uuid[]) ORDER BY product_id,acquired_at,id FOR UPDATE",
          [allocations.map((a) => a.lot_id)],
        );
        for (const a of allocations)
          await c.query(
            "UPDATE lots SET total_units=total_units+$2 WHERE id=$1",
            [a.lot_id, a.quantity],
          );
      }
      await c.query("UPDATE orders SET status=$2 WHERE id=$1", [id, status]);
      await c.query(
        "INSERT INTO ledger_events(id,dealer_id,type,details) VALUES($1,$2,$3,$4)",
        [
          randomUUID(),
          user.dealerId,
          "store.order." + status,
          JSON.stringify({ orderId: id, actor: user.id }),
        ],
      );
      await c.query("COMMIT");
      return { ...order, status };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}
export function installShop(
  app: Express,
  catalogue: Catalogue,
  demoAccounts: boolean,
  requireDealer: RequestHandler,
) {
  const shop = new Shop(catalogue),
    pool = catalogue.pool;
  const sid = (req: Request) =>
    req.session.shopId || (req.session.shopId = randomUUID());
  const customer = (req: Request) => {
    if (
      !req.session.customerId ||
      !req.session.authenticatedUntil ||
      req.session.authenticatedUntil < Date.now()
    )
      throw new HttpError(401, "Sign in as a customer first.");
    return req.session.customerId;
  };
  const loginLimiter = rateLimit({
    windowMs: 60000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.get("/api/shop/session", async (req, res) => {
    if (
      !req.session.customerId ||
      !req.session.authenticatedUntil ||
      req.session.authenticatedUntil < Date.now()
    )
      return res.json(null);
    res.json(
      (
        await pool.query("SELECT id,name,email FROM customers WHERE id=$1", [
          req.session.customerId,
        ])
      ).rows[0] || null,
    );
  });
  app.post("/api/shop/demo", loginLimiter, async (req, res) => {
    if (!demoAccounts) throw new HttpError(403, "Demo accounts are disabled.");
    const oldSid = sid(req),
      id = randomUUID(),
      email = `demo-${id}@example.invalid`;
    // A separate fictional customer per visitor prevents exposing another visitor's orders.
    await pool.query(
      "INSERT INTO customers(id,name,email,password_hash) VALUES($1,$2,$3,$4)",
      [
        id,
        "Alex — demo customer",
        email,
        await hashPassword(randomBytes(32).toString("hex")),
      ],
    );
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.shopId = oldSid;
    req.session.customerId = id;
    req.session.authenticatedUntil = Date.now() + 8 * 3600000;
    res.json({ id, name: "Alex — demo customer", email });
  });
  app.post("/api/shop/login", loginLimiter, async (req, res) => {
    const body = z
      .object({ email: z.email(), password: z.string().min(1).max(200) })
      .parse(req.body);
    const row = (
      await pool.query("SELECT * FROM customers WHERE email=$1", [
        body.email.toLowerCase(),
      ])
    ).rows[0];
    if (!row || !(await verifyPassword(body.password, row.password_hash)))
      throw new HttpError(401, "Invalid credentials.");
    const oldSid = sid(req);
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.shopId = oldSid;
    req.session.customerId = row.id;
    req.session.authenticatedUntil = Date.now() + 8 * 3600000;
    res.json({ id: row.id, name: row.name, email: row.email });
  });
  app.get("/api/shop/basket", async (req, res) =>
    res.json({ items: await shop.basket(sid(req)) }),
  );
  app.post("/api/shop/basket", async (req, res) => {
    const b = z
      .object({
        productId: z.uuid(),
        quantity: z.number().int().min(1).max(1000),
      })
      .strict()
      .parse(req.body);
    if (!(await catalogue.all()).some((p) => p.id === b.productId))
      throw new HttpError(404, "Product not found.");
    await pool.query(
      "INSERT INTO basket_lines VALUES($1,$2,$3) ON CONFLICT(session_id,product_id) DO UPDATE SET quantity=LEAST(1000,basket_lines.quantity+excluded.quantity)",
      [sid(req), b.productId, b.quantity],
    );
    res.json({ ok: true });
  });
  app.delete("/api/shop/basket/:id", async (req, res) => {
    await pool.query(
      "DELETE FROM basket_lines WHERE session_id=$1 AND product_id=$2",
      [sid(req), z.uuid().parse(req.params.id)],
    );
    res.json({ ok: true });
  });
  app.post("/api/shop/lock", async (req, res) =>
    res.json(await shop.lock(sid(req), customer(req))),
  );
  app.post("/api/shop/orders", async (req, res) => {
    const b = z
      .object({ lockId: z.uuid(), requestId: z.uuid() })
      .strict()
      .parse(req.body);
    res.json(await shop.place(customer(req), b.lockId, b.requestId));
  });
  app.get("/api/shop/orders", async (req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT o.*,COALESCE((SELECT jsonb_agg(l.snapshot) FROM order_lines l WHERE l.order_id=o.id),'[]') lines FROM orders o WHERE customer_id=$1 ORDER BY created_at DESC",
          [customer(req)],
        )
      ).rows,
    ),
  );
  app.get("/api/shop/holdings", async (req, res) => {
    const rows = (
      await pool.query(
        "SELECT l.product_id,sum(l.quantity)::int quantity,sum((l.snapshot->>'totalPence')::bigint) paid_pence FROM order_lines l JOIN orders o ON o.id=l.order_id WHERE o.customer_id=$1 AND o.status<>'cancelled' GROUP BY l.product_id",
        [customer(req)],
      )
    ).rows;
    const products = await catalogue.all(false);
    res.json(
      rows.map((r) => {
        const p = products.find((p) => p.id === r.product_id)!;
        const priced = catalogue.price(p);
        return {
          id: p.id,
          name: p.name,
          quantity: r.quantity,
          paidPence: Number(r.paid_pence),
          indicativeBuybackPence:
            priced.buybackPence === null
              ? null
              : priced.buybackPence * r.quantity,
          priceAt: priced.priceAt,
          stale: priced.stale,
          source: priced.source,
        };
      }),
    );
  });
  app.post("/api/admin/orders/:id/status", requireDealer, async (req, res) =>
    res.json(
      await shop.transition(
        z.uuid().parse(req.params.id),
        z.enum(["dispatched", "delivered", "cancelled"]).parse(req.body.status),
        res.locals.user,
      ),
    ),
  );
  return shop;
}
