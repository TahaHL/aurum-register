import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { QueryResultRow } from "pg";
import { z } from "zod";
import type { Buyback, DealerUser } from "../shared/types.js";
import { calculateQuote } from "../shared/pricing.js";
import type { SqlPool, SqlClient } from "./sql.js";
import { PriceFeed } from "./prices.js";
import { HttpError } from "./errors.js";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const iso = (d: Date | string) => new Date(d).toISOString();
export const buybackSelect =
  "SELECT b.*,d.name AS dealer_name FROM buybacks b JOIN dealers d ON d.id=b.dealer_id";
export function buyback(r: QueryResultRow, now: number): Buyback {
  const receiveBy = r.accepted_at
    ? new Date(new Date(r.accepted_at).getTime() + 15 * 60000).toISOString()
    : null;
  const expired =
    r.status === "open"
      ? new Date(r.expires_at).getTime() <= now
      : r.status === "accepted" && Date.parse(receiveBy!) <= now;
  return {
    id: r.id,
    dealerName: r.dealer_name,
    reference: r.reference,
    itemName: r.item_name,
    weightMg: r.weight_mg,
    fineness: r.fineness,
    quantity: r.quantity,
    discountBps: r.discount_bps,
    pricePerOunceGBP: r.price_per_ounce_gbp,
    priceSource: r.price_source,
    priceAt: iso(r.price_at),
    basePence: Number(r.base_pence),
    discountPence: Number(r.discount_pence),
    totalPence: Number(r.total_pence),
    status: expired ? "expired" : r.status,
    createdAt: iso(r.created_at),
    expiresAt: iso(r.expires_at),
    acceptedAt: r.accepted_at ? iso(r.accepted_at) : null,
    receiveBy,
    closedAt: r.closed_at ? iso(r.closed_at) : null,
    lotId: r.lot_id,
  };
}
const createSchema = z
  .object({
    reference: z.string().trim().min(1).max(80),
    itemName: z.string().trim().min(2).max(100),
    weightMg: z.number().int().min(1).max(1000000),
    fineness: z.number().int().min(1).max(10000),
    quantity: z.number().int().min(1).max(100),
    discountBps: z.number().int().min(0).max(2000),
  })
  .strict();
export class BuybackService {
  constructor(
    private pool: SqlPool,
    private feed: PriceFeed,
    private clock = Date.now,
  ) {}
  private async transaction<T>(work: (client: SqlClient) => Promise<T>) {
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
    actor: DealerUser | { dealerId: string },
    type: string,
    details: Record<string, unknown>,
  ) {
    await client.query(
      "INSERT INTO ledger_events(id,dealer_id,type,details,created_at) VALUES($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        actor.dealerId,
        type,
        {
          ...("id" in actor
            ? { actorId: actor.id, actorName: actor.name }
            : {}),
          ...details,
        },
        new Date(this.clock()),
      ],
    );
  }
  private token(row: QueryResultRow | undefined, token: string) {
    if (
      !row ||
      !timingSafeEqual(
        Buffer.from(row.token_hash, "hex"),
        Buffer.from(hash(token), "hex"),
      )
    )
      throw new HttpError(404, "Buy-back link is invalid or unavailable.");
  }
  async create(input: unknown, actor: DealerUser) {
    const valid = createSchema.parse(input),
      state = this.feed.state();
    if (state.marketClosed) throw new HttpError(503, state.quotePauseReason!);
    if (!state.snapshot || state.stale)
      throw new HttpError(
        503,
        "A fresh price is required to issue a buy-back quote.",
      );
    const snapshot = state.snapshot;
    const amounts = calculateQuote({
      ...valid,
      pricePerOunceGBP: snapshot.pricePerOunceGBP,
      marginBps: valid.discountBps,
      direction: "buy",
    });
    if (amounts.totalPence <= 0)
      throw new HttpError(
        400,
        "The assessed gold value must be at least one penny.",
      );
    return this.transaction(async (client) => {
      const id = randomUUID(),
        token = randomBytes(32).toString("hex"),
        now = this.clock();
      await client.query(
        `INSERT INTO buybacks(id,dealer_id,reference,item_name,weight_mg,fineness,quantity,discount_bps,price_per_ounce_gbp,price_source,price_at,base_pence,discount_pence,total_pence,token_hash,created_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          id,
          actor.dealerId,
          valid.reference,
          valid.itemName,
          valid.weightMg,
          valid.fineness,
          valid.quantity,
          valid.discountBps,
          snapshot.pricePerOunceGBP,
          snapshot.source,
          snapshot.providerAt,
          amounts.basePence,
          -amounts.premiumPence,
          amounts.totalPence,
          hash(token),
          new Date(now),
          new Date(now + 300000),
        ],
      );
      await this.event(client, actor, "buyback.created", {
        buybackId: id,
        reference: valid.reference,
        lotName: valid.itemName,
        totalPence: amounts.totalPence,
      });
      return {
        buyback: buyback(
          (await client.query(buybackSelect + " WHERE b.id=$1", [id])).rows[0],
          now,
        ),
        token,
      };
    });
  }
  async customer(id: string, token: string) {
    const row = (await this.pool.query(buybackSelect + " WHERE b.id=$1", [id]))
      .rows[0];
    this.token(row, token);
    return buyback(row, this.clock());
  }
  async accept(id: string, token: string, requestId: string) {
    z.uuid().parse(requestId);
    return this.transaction(async (client) => {
      const row = (
        await client.query("SELECT * FROM buybacks WHERE id=$1 FOR UPDATE", [
          id,
        ])
      ).rows[0];
      this.token(row, token);
      if (row.accept_request_id === requestId)
        return buyback(
          {
            ...row,
            dealer_name: (
              await client.query("SELECT name FROM dealers WHERE id=$1", [
                row.dealer_id,
              ])
            ).rows[0].name,
          },
          this.clock(),
        );
      if (row.status !== "open")
        throw new HttpError(
          409,
          "This buy-back quote has already been handled.",
        );
      if (new Date(row.expires_at).getTime() <= this.clock())
        throw new HttpError(
          410,
          "This buy-back quote expired. Ask for a new assessment.",
        );
      await client.query(
        "UPDATE buybacks SET status='accepted',accepted_at=$2,accept_request_id=$3 WHERE id=$1",
        [id, new Date(this.clock()), requestId],
      );
      await this.event(
        client,
        { dealerId: row.dealer_id },
        "buyback.accepted",
        { buybackId: id, reference: row.reference, lotName: row.item_name },
      );
      return buyback(
        (await client.query(buybackSelect + " WHERE b.id=$1", [id])).rows[0],
        this.clock(),
      );
    });
  }
  async complete(id: string, input: unknown, actor: DealerUser) {
    if (actor.role !== "owner")
      throw new HttpError(403, "Only owners can receive or cancel buy-backs.");
    const valid = z
      .object({
        action: z.enum(["received", "cancelled"]),
        requestId: z.uuid(),
        reason: z.string().trim().min(5).max(300),
        inspected: z.boolean().default(false),
        defaultPremiumBps: z.number().int().min(0).max(2000).default(300),
      })
      .strict()
      .parse(input);
    if (valid.action === "received" && !valid.inspected)
      throw new HttpError(
        400,
        "Confirm the assessed weight, purity and quantity before receiving gold.",
      );
    const payload = hash(JSON.stringify(valid));
    return this.transaction(async (client) => {
      const row = (
        await client.query(
          "SELECT * FROM buybacks WHERE id=$1 AND dealer_id=$2 FOR UPDATE",
          [id, actor.dealerId],
        )
      ).rows[0];
      if (!row) throw new HttpError(404, "Buy-back quote not found.");
      if (row.completion_request_id === valid.requestId) {
        if (row.completion_payload !== payload)
          throw new HttpError(
            409,
            "Request ID was used for a different outcome.",
          );
        return buyback(
          (await client.query(buybackSelect + " WHERE b.id=$1", [id])).rows[0],
          this.clock(),
        );
      }
      if (["received", "cancelled"].includes(row.status))
        throw new HttpError(409, "This buy-back is already closed.");
      if (
        valid.action === "received" &&
        (row.status !== "accepted" ||
          new Date(row.accepted_at).getTime() + 900000 <= this.clock())
      )
        throw new HttpError(
          410,
          "A current accepted buy-back is required. Reassess and issue a new quote.",
        );
      let lotId: string | null = null;
      if (valid.action === "received") {
        lotId = randomUUID();
        await client.query(
          `INSERT INTO lots(id,dealer_id,sku,name,description,weight_mg,fineness,total_units,default_premium_bps,acquired_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            lotId,
            actor.dealerId,
            "BUY-" + id.toUpperCase(),
            row.item_name,
            "Assessed fictional buy-back · " + row.reference,
            row.weight_mg,
            row.fineness,
            row.quantity,
            valid.defaultPremiumBps,
            new Date(this.clock()),
          ],
        );
      }
      await client.query(
        "UPDATE buybacks SET status=$2,closed_at=$3,completion_request_id=$4,completion_payload=$5,lot_id=$6 WHERE id=$1",
        [
          id,
          valid.action,
          new Date(this.clock()),
          valid.requestId,
          payload,
          lotId,
        ],
      );
      await this.event(client, actor, "buyback." + valid.action, {
        buybackId: id,
        lotId,
        reference: row.reference,
        lotName: row.item_name,
        quantity: row.quantity,
        before: 0,
        after: lotId ? row.quantity : 0,
        totalPence: Number(row.total_pence),
        reason: valid.reason,
      });
      return buyback(
        (await client.query(buybackSelect + " WHERE b.id=$1", [id])).rows[0],
        this.clock(),
      );
    });
  }
}
