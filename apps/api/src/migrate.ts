import { readFile } from "node:fs/promises";
import { connect } from "./db.js";
if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL");
const { sql } = connect(process.env.DATABASE_URL);
try {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(629851)`;
    await tx`CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY)`;
    const found =
      await tx`SELECT name FROM migrations WHERE name='001_initial'`;
    if (!found.length) {
      await tx.unsafe(
        await readFile(
          new URL("../migrations/001_initial.sql", import.meta.url),
          "utf8",
        ),
      );
      await tx`INSERT INTO migrations(name) VALUES ('001_initial')`;
    }
  });
} finally {
  await sql.end();
}
