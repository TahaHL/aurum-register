import { PGlite } from "@electric-sql/pglite";
import type { SqlPool, SqlClient } from "./sql.js";
import type { QueryResultRow } from "pg";
// PGlite has one session. Lease it for the entire transaction so unrelated
// reads cannot interleave with an uncommitted write. This is a preview driver,
// not evidence of PostgreSQL multi-connection concurrency behaviour.
export async function previewDatabase(directory?: string) {
  const database = new PGlite(directory);
  await database.waitReady;
  let tail = Promise.resolve();
  async function lease() {
    let unlock!: () => void;
    const previous = tail;
    tail = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    await previous;
    return unlock;
  }
  async function query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ) {
    if (!values && text.includes(";")) {
      await database.exec(text);
      return { rows: [] as Row[], rowCount: 0 };
    }
    const result = await database.query<Row>(text, values);
    return {
      rows: result.rows,
      rowCount: result.rows.length || result.affectedRows || 0,
    };
  }
  const pool: SqlPool = {
    query: async (text, values) => {
      const unlock = await lease();
      try {
        return await query(text, values);
      } finally {
        unlock();
      }
    },
    connect: async () => {
      const unlock = await lease();
      let released = false;
      const client: SqlClient = {
        query,
        release: () => {
          if (!released) {
            released = true;
            unlock();
          }
        },
      };
      return client;
    },
  };
  return {
    pool,
    close: () => database.close(),
    kind: "pglite-preview" as const,
  };
}
