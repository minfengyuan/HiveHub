import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
export function connect(url: string) {
  const sql = postgres(url, { max: 10 });
  return { sql, db: drizzle(sql) };
}
export type Database = ReturnType<typeof connect>["db"];
