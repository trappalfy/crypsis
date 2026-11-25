import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };
export type Db = PostgresJsDatabase<typeof schema>;

let cached: { url: string; db: Db; sql: postgres.Sql } | null = null;

/** One pooled client per process (serverless-friendly: small pool, no prepared statements for poolers). */
export function getDb(url = process.env.DATABASE_URL): Db {
  if (!url) throw new Error("DATABASE_URL is not set");
  if (cached?.url === url) return cached.db;
  const sql = postgres(url, { max: 5, prepare: false, idle_timeout: 20, connect_timeout: 10 });
  cached = { url, sql, db: drizzle(sql, { schema }) };
  return cached.db;
}

export async function closeDb() {
  await cached?.sql.end({ timeout: 5 });
  cached = null;
}
