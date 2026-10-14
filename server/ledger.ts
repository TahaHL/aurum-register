import {
  randomUUID,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import type { QueryResultRow } from "pg";
import { z } from "zod";
import type { SqlPool, SqlClient } from "./sql.js";
import { calculateQuote } from "../shared/pricing.js";
import type {
  Lot,
  Quote,
  Reservation,
  DealerUser,
  CreateLotInput,
  AdjustStockInput,
} from "../shared/types.js";
import { BuybackService, buyback, buybackSelect } from "./buybacks.js";
import { HttpError } from "./errors.js";
import { PriceFeed } from "./prices.js";
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const iso = (value: Date | string) => new Date(value).toISOString();
const movementFields = {
  reason: z.string().trim().min(5).max(300),
  requestId: z.uuid(),
};
const createLotSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .min(2)
      .max(40)
      .regex(/^[A-Z0-9][A-Z0-9-]*$/),
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(300),
    weightMg: z.number().int().min(1).max(1000000),
    fineness: z.number().int().min(1).max(10000),
    totalUnits: z.number().int().min(1).max(10000),
    defaultPremiumBps: z.number().int().min(0).max(2000).default(300),
    ...movementFields,
  })
  .strict();
const adjustStockSchema = z
  .object({
    delta: z
      .number()
      .int()
      .min(-10000)
      .max(10000)
      .refine((value) => value !== 0),
    ...movementFields,
  })
  .strict();
function reservation(row: QueryResultRow): Reservation {
  return {
    id: row.id,
    quoteId: row.quote_id,
    quantity: row.quantity,
    status: row.status,
    closedAt: row.closed_at ? iso(row.closed_at) : null,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
  };
}
function lot(row: QueryResultRow): Lot {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    weightMg: row.weight_mg,
    fineness: row.fineness,
    totalUnits: row.total_units,
    reservedUnits: row.reserved_units,
    availableUnits: row.total_units - row.reserved_units,
    acquiredAt: iso(row.acquired_at),
    defaultPremiumBps: row.default_premium_bps,
  };
}
function quote(row: QueryResultRow, now: number): Quote {
  return {
    id: row.id,
    dealerName: row.dealer_name,
    reference: row.reference,
    lotId: row.lot_id,
    lotName: row.lot_name,
    sku: row.sku,
    quantity: row.quantity,
    weightMg: row.weight_mg,
    fineness: row.fineness,
    pricePerOunceGBP: row.price_per_ounce_gbp,
    priceSource: row.price_source,
    priceAt: iso(row.price_at),
    basePence: Number(row.base_pence),
    premiumPence: Number(row.premium_pence),
    totalPence: Number(row.total_pence),
    marginBps: row.margin_bps,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    status:
      row.status === "open" && new Date(row.expires_at).getTime() <= now
        ? "expired"
        : row.status,
    reservation: row.reservation_json
      ? reservation(row.reservation_json)
      : null,
  };
}
const quoteSelect = `SELECT q.*,d.name AS dealer_name,l.name AS lot_name,l.sku,(SELECT row_to_json(r) FROM reservations r WHERE r.quote_id=q.id AND r.dealer_id=q.dealer_id) AS reservation_json FROM quotes q JOIN lots l ON l.id=q.lot_id AND l.dealer_id=q.dealer_id JOIN dealers d ON d.id=q.dealer_id`;
export class Ledger {
  constructor(
    public pool: SqlPool,
    private feed: PriceFeed,
    private clock = Date.now,
  ) {}
  private async transaction<T>(
    work: (client: SqlClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  private async event(
    client: SqlClient,
    dealerId: string,
    type: string,
    details: Record<string, unknown>,
  ) {
    await client.query(
      "INSERT INTO ledger_events(id,dealer_id,type,details,created_at) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), dealerId, type, details, new Date(this.clock())],
    );
  }
  get buybacks() {
    return new BuybackService(this.pool, this.feed, this.clock);
  }
  async workspace(dealerId: string) {
    const [lots, quotes, events, buybacks] = await Promise.all([
      this.pool.query(
        "SELECT * FROM lots WHERE dealer_id=$1 ORDER BY sku LIMIT 200",
        [dealerId],
      ),
      this.pool.query(
        quoteSelect +
          " WHERE q.dealer_id=$1 ORDER BY q.created_at DESC LIMIT 50",
        [dealerId],
      ),
      this.pool.query(
        "SELECT * FROM ledger_events WHERE dealer_id=$1 ORDER BY created_at DESC LIMIT 50",
        [dealerId],
      ),
      this.pool.query(
        buybackSelect +
          " WHERE b.dealer_id=$1 ORDER BY b.created_at DESC LIMIT 50",
        [dealerId],
      ),
    ]);
    return {
      lots: lots.rows.map(lot),
      quotes: quotes.rows.map((row) => quote(row, this.clock())),
      buybacks: buybacks.rows.map((row) => buyback(row, this.clock())),
      events: events.rows.map((row) => ({
        id: row.id,
        type: row.type,
        details: row.details,
        createdAt: iso(row.created_at),
      })),
      price: this.feed.state(),
    };
  }
  async create(
    input: {
      lotId: string;
      quantity: number;
      marginBps: number;
      reference: string;
    },
    actor: DealerUser,
  ) {
    return this.transaction(async (client) => {
      const stock = (
        await client.query("SELECT * FROM lots WHERE id=$1 AND dealer_id=$2", [
          input.lotId,
          actor.dealerId,
        ])
      ).rows[0];
      if (!stock) throw new HttpError(404, "Inventory lot not found.");
      if (input.quantity > stock.total_units - stock.reserved_units)
        throw new HttpError(
          409,
          "Not enough available units to issue this quote.",
        );
      const state = this.feed.state();
      if (state.marketClosed) throw new HttpError(503, state.quotePauseReason!);
      if (!state.snapshot || state.stale)
        throw new HttpError(
          503,
          "A fresh price is required. Refresh the feed before creating a quote.",
        );
      const amounts = calculateQuote({
        pricePerOunceGBP: state.snapshot.pricePerOunceGBP,
        weightMg: stock.weight_mg,
        fineness: stock.fineness,
        quantity: input.quantity,
        marginBps: input.marginBps,
      });
      const id = randomUUID(),
        token = randomBytes(32).toString("hex"),
        now = new Date(this.clock()),
        expires = new Date(this.clock() + 5 * 60000);
      await client.query(
        `INSERT INTO quotes(id,lot_id,reference,quantity,weight_mg,fineness,price_per_ounce_gbp,price_source,price_at,base_pence,premium_pence,total_pence,margin_bps,token_hash,created_at,expires_at,dealer_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          id,
          input.lotId,
          input.reference,
          input.quantity,
          stock.weight_mg,
          stock.fineness,
          state.snapshot.pricePerOunceGBP,
          state.snapshot.source,
          state.snapshot.providerAt,
          amounts.basePence,
          amounts.premiumPence,
          amounts.totalPence,
          input.marginBps,
          digest(token),
          now,
          expires,
          actor.dealerId,
        ],
      );
      await this.event(client, actor.dealerId, "quote.created", {
        actorId: actor.id,
        actorName: actor.name,
        quoteId: id,
        reference: input.reference,
        lotName: stock.name,
        quantity: input.quantity,
        totalPence: amounts.totalPence,
      });
      return {
        quote: quote(
          (await client.query(quoteSelect + " WHERE q.id=$1", [id])).rows[0],
          this.clock(),
        ),
        token,
      };
    });
  }
  private async previousMovement(
    client: SqlClient,
    actor: DealerUser,
    requestId: string,
    payloadHash: string,
  ): Promise<Lot | undefined> {
    // Serialise only this dealer/request pair, including the first INSERT.
    // Locking a nonexistent stock_movements row would not prevent two retries.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${actor.dealerId}:${requestId}`,
    ]);
    const previous = (
      await client.query(
        "SELECT payload_hash,result FROM stock_movements WHERE dealer_id=$1 AND request_id=$2",
        [actor.dealerId, requestId],
      )
    ).rows[0];
    if (!previous) return undefined;
    if (previous.payload_hash !== payloadHash)
      throw new HttpError(
        409,
        "This request ID was already used for a different stock movement.",
      );
    return previous.result as Lot;
  }
  private async recordMovement(
    client: SqlClient,
    actor: DealerUser,
    input: { requestId: string; reason: string },
    kind: "received" | "adjusted",
    payloadHash: string,
    before: number,
    result: Lot,
  ) {
    const delta = result.totalUnits - before;
    await client.query(
      `INSERT INTO stock_movements(id,dealer_id,lot_id,request_id,actor_id,kind,payload_hash,delta,before_units,after_units,reason,result,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        randomUUID(),
        actor.dealerId,
        result.id,
        input.requestId,
        actor.id,
        kind,
        payloadHash,
        delta,
        before,
        result.totalUnits,
        input.reason,
        result,
        new Date(this.clock()),
      ],
    );
    await this.event(client, actor.dealerId, `inventory.${kind}`, {
      actorId: actor.id,
      actorName: actor.name,
      lotId: result.id,
      lotName: result.name,
      sku: result.sku,
      reason: input.reason,
      delta,
      before,
      after: result.totalUnits,
    });
  }
  async createLot(input: CreateLotInput, actor: DealerUser): Promise<Lot> {
    const valid = createLotSchema.parse(input);
    const payloadHash = digest(JSON.stringify({ kind: "received", ...valid }));
    try {
      return await this.transaction(async (client) => {
        const previous = await this.previousMovement(
          client,
          actor,
          valid.requestId,
          payloadHash,
        );
        if (previous) return previous;
        const result = lot(
          (
            await client.query(
              `INSERT INTO lots(id,dealer_id,sku,name,description,weight_mg,fineness,total_units,acquired_at,default_premium_bps)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
              [
                randomUUID(),
                actor.dealerId,
                valid.sku,
                valid.name,
                valid.description,
                valid.weightMg,
                valid.fineness,
                valid.totalUnits,
                new Date(this.clock()),
                valid.defaultPremiumBps,
              ],
            )
          ).rows[0],
        );
        await this.recordMovement(
          client,
          actor,
          valid,
          "received",
          payloadHash,
          0,
          result,
        );
        return result;
      });
    } catch (error) {
      if (
        (error as { code?: string; constraint?: string }).code === "23505" &&
        (error as { constraint?: string }).constraint === "lots_dealer_sku_key"
      )
        throw new HttpError(409, "This SKU already exists in your inventory.");
      throw error;
    }
  }
  async adjustStock(
    lotId: string,
    input: AdjustStockInput,
    actor: DealerUser,
  ): Promise<Lot> {
    if (actor.role !== "owner")
      throw new HttpError(403, "Only owners can adjust existing stock.");
    z.uuid().parse(lotId);
    const valid = adjustStockSchema.parse(input);
    const payloadHash = digest(
      JSON.stringify({ kind: "adjusted", lotId, ...valid }),
    );
    return this.transaction(async (client) => {
      const previous = await this.previousMovement(
        client,
        actor,
        valid.requestId,
        payloadHash,
      );
      if (previous) return previous;
      const stock = (
        await client.query(
          "SELECT * FROM lots WHERE id=$1 AND dealer_id=$2 FOR UPDATE",
          [lotId, actor.dealerId],
        )
      ).rows[0];
      if (!stock) throw new HttpError(404, "Inventory lot not found.");
      const after = stock.total_units + valid.delta;
      if (after < stock.reserved_units)
        throw new HttpError(
          409,
          "Stock cannot fall below the units held for customers.",
        );
      if (after > 10000)
        throw new HttpError(
          409,
          "A lot cannot contain more than 10,000 units.",
        );
      const result = lot(
        (
          await client.query(
            "UPDATE lots SET total_units=$1 WHERE id=$2 AND dealer_id=$3 RETURNING *",
            [after, lotId, actor.dealerId],
          )
        ).rows[0],
      );
      await this.recordMovement(
        client,
        actor,
        valid,
        "adjusted",
        payloadHash,
        stock.total_units,
        result,
      );
      return result;
    });
  }
  async setPremium(
    id: string,
    input: unknown,
    actor: DealerUser,
  ): Promise<Lot> {
    if (actor.role !== "owner")
      throw new HttpError(403, "Only owners can change default premiums.");
    const valid = z
      .object({
        defaultPremiumBps: z.number().int().min(0).max(2000),
        reason: z.string().trim().min(5).max(300),
      })
      .strict()
      .parse(input);
    return this.transaction(async (client) => {
      const row = (
        await client.query(
          "SELECT * FROM lots WHERE id=$1 AND dealer_id=$2 FOR UPDATE",
          [id, actor.dealerId],
        )
      ).rows[0];
      if (!row) throw new HttpError(404, "Inventory lot not found.");
      if (row.default_premium_bps === valid.defaultPremiumBps) return lot(row);
      const updated = (
        await client.query(
          "UPDATE lots SET default_premium_bps=$1 WHERE id=$2 RETURNING *",
          [valid.defaultPremiumBps, id],
        )
      ).rows[0];
      await this.event(client, actor.dealerId, "inventory.premium", {
        actorId: actor.id,
        actorName: actor.name,
        lotId: id,
        lotName: row.name,
        beforeBps: row.default_premium_bps,
        afterBps: valid.defaultPremiumBps,
        reason: valid.reason,
      });
      return lot(updated);
    });
  }
  private checkToken(row: QueryResultRow | undefined, token: string) {
    if (
      !row ||
      !timingSafeEqual(
        Buffer.from(row.token_hash, "hex"),
        Buffer.from(digest(token), "hex"),
      )
    )
      throw new HttpError(404, "Quote link is invalid or unavailable.");
  }
  async customerQuote(id: string, token: string) {
    const row = (await this.pool.query(quoteSelect + " WHERE q.id=$1", [id]))
      .rows[0];
    this.checkToken(row, token);
    return quote(row, this.clock());
  }
  async accept(id: string, token: string, requestId: string) {
    return this.transaction(async (client) => {
      const row = (
        await client.query("SELECT * FROM quotes WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      this.checkToken(row, token);
      const existing = (
        await client.query("SELECT * FROM reservations WHERE quote_id=$1", [id])
      ).rows[0];
      if (existing) {
        if (existing.request_id === requestId) return reservation(existing);
        throw new HttpError(409, "This quote has already been accepted.");
      }
      const stock = (
        await client.query(
          "SELECT * FROM lots WHERE id=$1 AND dealer_id=$2 FOR UPDATE",
          [row.lot_id, row.dealer_id],
        )
      ).rows[0];
      const now = this.clock();
      if (row.status !== "open" || new Date(row.expires_at).getTime() <= now)
        throw new HttpError(
          410,
          "This quote has expired. Ask the dealer for a fresh quote.",
        );
      if (stock.total_units - stock.reserved_units < row.quantity)
        throw new HttpError(
          409,
          "Another customer reserved this stock. Ask the dealer for a new quote.",
        );
      const reservationId = randomUUID();
      await client.query(
        "UPDATE lots SET reserved_units=reserved_units+$1 WHERE id=$2 AND dealer_id=$3",
        [row.quantity, row.lot_id, row.dealer_id],
      );
      await client.query(
        "INSERT INTO reservations(id,quote_id,lot_id,request_id,quantity,created_at,expires_at,dealer_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          reservationId,
          id,
          row.lot_id,
          requestId,
          row.quantity,
          new Date(now),
          new Date(now + 15 * 60000),
          row.dealer_id,
        ],
      );
      await client.query("UPDATE quotes SET status='accepted' WHERE id=$1", [
        id,
      ]);
      await this.event(client, row.dealer_id, "stock.reserved", {
        quoteId: id,
        reservationId,
        reference: row.reference,
        lotName: stock.name,
        quantity: row.quantity,
      });
      return reservation(
        (
          await client.query("SELECT * FROM reservations WHERE id=$1", [
            reservationId,
          ])
        ).rows[0],
      );
    });
  }
  async completeReservation(
    id: string,
    input: { action: "sold" | "released"; reason: string; requestId: string },
    actor: DealerUser,
  ): Promise<Reservation> {
    if (actor.role !== "owner")
      throw new HttpError(
        403,
        "Only owners can complete or release reservations.",
      );
    z.uuid().parse(id);
    const valid = z
      .object({ action: z.enum(["sold", "released"]), ...movementFields })
      .strict()
      .parse(input);
    return this.transaction(async (client) => {
      // Match the expiry worker's reservation -> lot lock order. No quote lock:
      // the pricing snapshot is immutable and remains an accepted quote.
      const row = (
        await client.query(
          "SELECT * FROM reservations WHERE id=$1 AND dealer_id=$2 FOR UPDATE",
          [id, actor.dealerId],
        )
      ).rows[0];
      if (!row) throw new HttpError(404, "Reservation not found.");
      if (row.completion_request_id === valid.requestId) {
        if (
          row.status !== valid.action ||
          row.completion_reason !== valid.reason
        )
          throw new HttpError(
            409,
            "This request ID was already used for a different outcome.",
          );
        return reservation(row);
      }
      if (row.status !== "held")
        throw new HttpError(
          409,
          "This reservation is already closed. Refresh the desk.",
        );
      const stock = (
        await client.query(
          "SELECT * FROM lots WHERE id=$1 AND dealer_id=$2 FOR UPDATE",
          [row.lot_id, actor.dealerId],
        )
      ).rows[0];
      const now = this.clock();
      // Check after waiting for stock locks, even if the expiry worker is delayed.
      if (valid.action === "sold" && new Date(row.expires_at).getTime() <= now)
        throw new HttpError(
          410,
          "The hold has expired. Issue a new quote before recording a sale.",
        );
      const sold = valid.action === "sold";
      await client.query(
        "UPDATE lots SET total_units=total_units-$1,reserved_units=reserved_units-$2 WHERE id=$3 AND dealer_id=$4",
        [sold ? row.quantity : 0, row.quantity, row.lot_id, actor.dealerId],
      );
      const result = reservation(
        (
          await client.query(
            "UPDATE reservations SET status=$1,closed_at=$2,completion_request_id=$3,completion_reason=$4,completed_by=$5 WHERE id=$6 RETURNING *",
            [
              valid.action,
              new Date(now),
              valid.requestId,
              valid.reason,
              actor.id,
              id,
            ],
          )
        ).rows[0],
      );
      const snapshot = (
        await client.query(
          "SELECT reference,total_pence FROM quotes WHERE id=$1",
          [row.quote_id],
        )
      ).rows[0];
      await this.event(
        client,
        actor.dealerId,
        sold ? "stock.sold" : "stock.released",
        {
          actorId: actor.id,
          actorName: actor.name,
          reservationId: id,
          quoteId: row.quote_id,
          lotId: row.lot_id,
          lotName: stock.name,
          reference: snapshot.reference,
          totalPence: Number(snapshot.total_pence),
          quantity: row.quantity,
          reason: valid.reason,
          requestId: valid.requestId,
          before: stock.total_units,
          after: stock.total_units - (sold ? row.quantity : 0),
          reservedBefore: stock.reserved_units,
          reservedAfter: stock.reserved_units - row.quantity,
        },
      );
      return result;
    });
  }
  async releaseExpired() {
    return this.transaction(async (client) => {
      const expired = await client.query(
        "SELECT * FROM reservations WHERE status='held' AND expires_at<=$1 ORDER BY lot_id,id FOR UPDATE SKIP LOCKED LIMIT 50",
        [new Date(this.clock())],
      );
      for (const row of expired.rows) {
        await client.query(
          "UPDATE lots SET reserved_units=reserved_units-$1 WHERE id=$2 AND dealer_id=$3",
          [row.quantity, row.lot_id, row.dealer_id],
        );
        await client.query(
          "UPDATE reservations SET status='released',closed_at=$2 WHERE id=$1",
          [row.id, new Date(this.clock())],
        );
        await this.event(client, row.dealer_id, "stock.released", {
          reservationId: row.id,
          quoteId: row.quote_id,
          quantity: row.quantity,
          reason: "Hold expired after 15 minutes",
        });
      }
      return expired.rowCount;
    });
  }
}
