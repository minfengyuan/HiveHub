import { test } from "node:test";
import assert from "node:assert/strict";
import ssh2 from "ssh2";
import { generateKeyPairSync, createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { servers } from "../src/schema.js";
import { encrypt } from "../src/crypto.js";
import { monitor, ssh } from "../src/monitor.js";
import type { Database } from "../src/db.js";

test("monitor deduplicates refresh and preserves last good metrics on failure", async () => {
  const pg = new PGlite();
  await pg.exec(
    await readFile(
      new URL("../migrations/001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  const db = drizzle(pg) as unknown as Database;
  const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs1", format: "pem" })
    .toString();
  let broken = false;
  const output =
    "CPU1 cpu 100 0 50 850 0 0 0 0\nCPU2 cpu 120 0 60 920 0 0 0 0\nMemTotal: 1000 kB\nMemAvailable: 400 kB\nUPTIME 123.45 0\nDISKS\nFilesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda 1000 200 800 20% /\n";
  const server = new ssh2.Server({ hostKeys: [privateKey] }, (client) => {
    client.on("error", () => {});
    client.on("authentication", (ctx) => ctx.accept());
    client.on("ready", () =>
      client.on("session", (accept) =>
        accept().on("exec", (accept) => {
          const stream = accept();
          setTimeout(() => {
            stream.write(broken ? "broken" : output);
            stream.exit(0);
            stream.end();
          }, 50);
        }),
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const key = createHash("sha256").update("test-key").digest("hex");
    const fingerprint = await ssh(
      { host: "127.0.0.1", port, username: "test", fingerprint: null },
      { privateKey },
      true,
    );
    const [row] = await db
      .insert(servers)
      .values({
        name: "test",
        host: "127.0.0.1",
        port,
        username: "test",
        fingerprint,
        secret: encrypt({ privateKey }, key),
      })
      .returning();
    const collector = monitor(db, key);
    const first = collector.refresh(row!.id);
    assert.equal((await collector.refresh(row!.id)).status, "busy");
    assert.equal((await first).status, "ok");
    const [good] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, row!.id));
    assert(good?.lastSuccess);
    assert.equal(good.metrics?.uptime, 123.45);
    broken = true;
    assert.equal((await collector.refresh(row!.id)).status, "error");
    const [bad] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, row!.id));
    assert.deepEqual(bad?.metrics, good.metrics);
    assert.equal(bad?.lastSuccess?.getTime(), good.lastSuccess.getTime());
    assert(bad?.error);
    assert(!collector.isActive(row!.id));
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    await pg.close();
  }
});
