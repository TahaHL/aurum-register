import { randomUUID } from "node:crypto";
import { Catalogue } from "./catalogue.js";
import { DEMO_DEALER_ID } from "./migrate.js";
import { priceProduct, vatFor } from "../shared/pricing.js";
import { hashPassword } from "./auth.js";
import type { Metal } from "../shared/types.js";
/** A fixed deterministic schedule, labelled at every boundary. No real customer data. */
export async function seedStoreOrders(catalogue: Catalogue) {
  const pool = catalogue.pool;
  if (
    (
      await pool.query(
        "SELECT 1 FROM ledger_events WHERE type='store.demo_history.seeded' AND dealer_id=$1",
        [DEMO_DEALER_ID],
      )
    ).rowCount
  )
    return;
  const products = await catalogue.all(),
    histories: Partial<Record<Metal, any[]>> = {};
  for (const metal of ["XAU", "XAG", "XPT", "XPD"] as const) {
    try {
      histories[metal] =
        await catalogue.markets.histories[metal].referencePoints();
    } catch {
      histories[metal] = [];
    }
  }
  const password = await hashPassword(randomUUID()),
    client = await pool.connect();
  let inserted = 0;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(710309)");
    if (
      (
        await client.query(
          "SELECT 1 FROM ledger_events WHERE type='store.demo_history.seeded' AND dealer_id=$1",
          [DEMO_DEALER_ID],
        )
      ).rowCount
    ) {
      await client.query("COMMIT");
      return;
    }
    const customerId = randomUUID();
    await client.query(
      "INSERT INTO customers(id,name,email,password_hash) VALUES($1,$2,$3,$4)",
      [
        customerId,
        "Historical demo customer",
        customerId + "@example.invalid",
        password,
      ],
    );
    for (let day = 89; day >= 0; day--) {
      const at = new Date(Date.now() - day * 86400000);
      at.setUTCHours(10, 0, 0, 0);
      const p = products[(day * 37 + 11) % products.length];
      if (!p) continue;
      const point = histories[p.metal as Metal]
        ?.filter((r) => Date.parse(r.providerAt) <= at.getTime())
        .at(-1);
      if (!point) continue;
      const lots = (
        await client.query(
          "SELECT * FROM lots WHERE product_id=$1 AND acquired_at<=$2 AND total_units>reserved_units ORDER BY product_id,acquired_at,id FOR UPDATE",
          [p.id, at],
        )
      ).rows;
      if (!lots.length) continue;
      const pricing = priceProduct({
          spot: point.pricePerOunceGBP,
          fineWeightMgPerPack: p.fine_weight_mg_per_pack,
          quantity: 1,
          tiers: p.tiers,
        }),
        vatPence = vatFor(p.metal, pricing.linePence);
      const line = {
        productId: p.id,
        name: p.name,
        metal: p.metal,
        category: p.category,
        quantity: 1,
        spot: point.pricePerOunceGBP,
        source: point.source,
        priceAt: point.providerAt,
        tier: pricing.tier,
        unitPence: pricing.unitPence,
        netPence: pricing.linePence,
        vatPence,
        totalPence: pricing.linePence + vatPence,
        simulated: true,
      };
      const lockId = randomUUID(),
        orderId = randomUUID(),
        lineId = randomUUID();
      await client.query(
        "INSERT INTO checkout_locks(id,customer_id,session_id,lines,net_pence,vat_pence,total_pence,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          lockId,
          customerId,
          randomUUID(),
          JSON.stringify([line]),
          line.netPence,
          vatPence,
          line.totalPence,
          at,
          new Date(at.getTime() + 600000),
        ],
      );
      await client.query(
        "INSERT INTO orders(id,customer_id,lock_id,request_id,status,net_pence,vat_pence,total_pence,created_at) VALUES($1,$2,$3,$4,'delivered',$5,$6,$7,$8)",
        [
          orderId,
          customerId,
          lockId,
          randomUUID(),
          line.netPence,
          vatPence,
          line.totalPence,
          at,
        ],
      );
      await client.query("INSERT INTO order_lines VALUES($1,$2,$3,1,$4)", [
        lineId,
        orderId,
        p.id,
        JSON.stringify(line),
      ]);
      await client.query("INSERT INTO order_allocations VALUES($1,$2,1,$3)", [
        lineId,
        lots[0].id,
        lots[0].unit_cost_pence,
      ]);
      await client.query(
        "UPDATE lots SET total_units=total_units-1 WHERE id=$1",
        [lots[0].id],
      );
      await client.query(
        "INSERT INTO ledger_events(id,dealer_id,type,details,created_at) VALUES($1,$2,$3,$4,$5)",
        [
          randomUUID(),
          DEMO_DEALER_ID,
          "store.demo_order.seeded",
          JSON.stringify({
            orderId,
            simulated: true,
            priceAt: point.providerAt,
          }),
          at,
        ],
      );
      inserted++;
    }
    // Leave an unavailable series retryable instead of pretending seed succeeded.
    if (inserted)
      await client.query(
        "INSERT INTO ledger_events(id,dealer_id,type,details) VALUES($1,$2,$3,$4)",
        [
          randomUUID(),
          DEMO_DEALER_ID,
          "store.demo_history.seeded",
          JSON.stringify({ orders: inserted, simulated: true }),
        ],
      );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
