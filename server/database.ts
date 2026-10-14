import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";
import { startLocalPostgres } from "./local-postgres.js";
import { previewDatabase } from "./preview-database.js";
export async function openDatabase() {
  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 12,
    });
    return { pool, close: async () => pool.end(), kind: "postgresql" as const };
  }
  if (process.env.NODE_ENV === "production")
    throw Error(
      "Production requires DATABASE_URL; embedded PostgreSQL is local development only.",
    );
  if (process.env.LOCAL_DATABASE !== "postgres") {
    await fs.mkdir(".local", { recursive: true });
    return previewDatabase(
      path.resolve(
        process.env.PREVIEW_DATABASE_PATH || ".local/demo-v2",
      ),
    );
  }
  const directory = path.resolve(".local/postgres");
  await fs.mkdir(path.dirname(directory), { recursive: true });
  const embedded = await startLocalPostgres({
    directory,
    user: "quoteledger",
    password: "local-demo-only",
    port: Number(process.env.PG_PORT || 5437),
  });
  const pool = new pg.Pool({
    connectionString: `postgresql://quoteledger:local-demo-only@127.0.0.1:${process.env.PG_PORT || 5437}/postgres`,
    max: 12,
  });
  return {
    pool,
    close: async () => {
      await pool.end();
      await embedded.stop();
    },
    kind: "postgresql" as const,
  };
}
