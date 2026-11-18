// Disposable browser-test backend. Never used by the production entrypoint.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { hash } from "argon2";
import { buildApp } from "../src/app.js";
import { migrationNames, readMigration } from "../src/migrations.js";
import { admins } from "../src/schema.js";
import type { Database } from "../src/db.js";
const pg = new PGlite();
for (const name of migrationNames) await pg.exec(await readMigration(name));
const db = drizzle(pg) as unknown as Database;
await db
  .insert(admins)
  .values({
    username: "preview",
    passwordHash: await hash("preview-local-only"),
  });
const { app } = await buildApp(db, {
  databaseUrl: "unused",
  masterKey: "ab".repeat(32),
  origin: "http://localhost:5173",
  secure: false,
  port: 3000,
});
await app.listen({ host: "127.0.0.1", port: 3000 });
for (const sig of ["SIGTERM", "SIGINT"])
  process.on(
    sig,
    () =>
      void app
        .close()
        .then(() => pg.close())
        .then(() => process.exit(0)),
  );
