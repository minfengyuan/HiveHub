// Disposable browser-test backend. Never used by the production entrypoint.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFile } from "node:fs/promises";
import { hash } from "argon2";
import { buildApp } from "../src/app.js";
import { admins } from "../src/schema.js";
import type { Database } from "../src/db.js";
const pg = new PGlite();
await pg.exec(
  await readFile(
    new URL("../migrations/001_initial.sql", import.meta.url),
    "utf8",
  ),
);
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
