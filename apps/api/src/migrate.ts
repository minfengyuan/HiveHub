import { connect } from "./db.js";
import { migrationNames, readMigration } from "./migrations.js";
if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL");
const { sql } = connect(process.env.DATABASE_URL);
try {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(629851)`;
    await tx`CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY)`;
    for (const name of migrationNames) {
      const found = await tx`SELECT name FROM migrations WHERE name = ${name}`;
      if (found.length) continue;
      await tx.unsafe(await readMigration(name));
      await tx`INSERT INTO migrations(name) VALUES (${name})`;
    }
  });
} finally {
  await sql.end();
}
