import type { QueryResultRow } from "pg";
export interface SqlClient {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
  release(): void;
}
export interface SqlPool extends Pick<SqlClient, "query"> {
  connect(): Promise<SqlClient>;
}
