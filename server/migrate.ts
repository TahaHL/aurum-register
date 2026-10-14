import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SqlPool } from "./sql.js";
export const DEMO_DEALER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export async function migrate(pool: SqlPool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(710307)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const dir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "migrations",
    );
    for (const name of (await fs.readdir(dir))
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      if (
        (
          await client.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
            name,
          ])
        ).rowCount
      )
        continue;
      await client.query(await fs.readFile(path.join(dir, name), "utf8"));
      await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [
        name,
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function seed(pool: SqlPool) {
  await pool.query(
    "INSERT INTO dealers(id,name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",
    [DEMO_DEALER_ID, "Taha Hadj Lakehal"],
  );
  const lots = [
    [
      "11111111-1111-4111-8111-111111111111",
      "AU-BAR-020",
      "20g minted gold bar",
      "Sealed assay card � fictional stock",
      20000,
      9999,
      12,
      400,
    ],
    [
      "22222222-2222-4222-8222-222222222222",
      "AU-BAR-100",
      "100g cast gold bar",
      "Cast finish � fictional stock",
      100000,
      9999,
      4,
      200,
    ],
    [
      "33333333-3333-4333-8333-333333333333",
      "AU-COIN-BRIT",
      "1oz Gold Britannia",
      "31.103g gross � sample product, fictional stock",
      31103,
      9999,
      8,
      500,
    ],
    [
      "44444444-4444-4444-8444-444444444444",
      "AU-COIN-SOV",
      "Gold Sovereign",
      "7.988g gross � 22ct sample coin, fictional stock",
      7988,
      9167,
      1,
      600,
    ],
  ];
  for (const values of lots)
    await pool.query(
      "INSERT INTO lots(id,sku,name,description,weight_mg,fineness,total_units,default_premium_bps,dealer_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING",
      [...values, DEMO_DEALER_ID],
    );
}
