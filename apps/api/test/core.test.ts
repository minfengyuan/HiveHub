import { test } from "node:test";
import assert from "node:assert/strict";
import { encrypt, decrypt, sessionHash } from "../src/crypto.js";
import { parseMetrics } from "../src/monitor.js";
import { config } from "../src/config.js";
test("credential encryption authenticates ciphertext and hides plaintext", () => {
  const key = "ab".repeat(32);
  const secret = { privateKey: "private-key", passphrase: "passphrase" };
  const encrypted = encrypt(secret, key);
  assert(!encrypted.includes(secret.privateKey));
  assert.deepEqual(decrypt(encrypted, key), secret);
  assert.throws(() => decrypt(encrypted, "cd".repeat(32)));
  const parts = encrypted.split(".");
  parts[2] = Buffer.from("tampered").toString("base64");
  assert.throws(() => decrypt(parts.join("."), key));
  assert.equal(sessionHash("token").length, 64);
});
test("Linux metrics parse CPU delta, available memory, disks and uptime", () => {
  const output =
    "CPU1 cpu 100 0 50 850 0 0 0 0 0 0\nCPU2 cpu 120 0 60 920 0 0 0 0 0 0\nMemTotal: 1000 kB\nMemAvailable: 400 kB\nUPTIME 123.45 0\nDISKS\nFilesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda 1000 200 800 20% /\n";
  const result = parseMetrics(output);
  assert.equal(result.cpu, 30.000000000000004);
  assert.deepEqual(result.memory, { used: 614400, total: 1024000 });
  assert.equal(result.disks[0]?.mount, "/");
  assert.equal(result.uptime, 123.45);
  assert.throws(() => parseMetrics("broken"));
});
test("configuration requires credentials and an HTTP origin", () => {
  assert.throws(() => config({}));
  assert.throws(() =>
    config({
      DATABASE_URL: "postgres://localhost/db",
      MASTER_KEY: "short",
      APP_ORIGIN: "https://hub.example",
    }),
  );
  assert.equal(
    config({
      DATABASE_URL: "postgres://localhost/db",
      MASTER_KEY: "ab".repeat(32),
      APP_ORIGIN: "https://hub.example",
    }).secure,
    true,
  );
});

test("SSH host probing, pinned collection, changed host rejection and auth failure", async () => {
  const { Server } = (await import("ssh2")).default;
  const { generateKeyPairSync, createHash } = await import("node:crypto");
  const { ssh } = await import("../src/monitor.js");
  const key = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs1", format: "pem" })
    .toString();
  let rejectAuth = false;
  const server = new Server({ hostKeys: [key] }, (client) => {
    client.on("error", () => {});
    client.on("authentication", (ctx) =>
      rejectAuth ? ctx.reject() : ctx.accept(),
    );
    client.on("ready", () =>
      client.on("session", (accept) => {
        const session = accept();
        session.on("exec", (accept) => {
          const stream = accept();
          stream.write("collected");
          stream.exit(0);
          stream.end();
        });
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const row = {
    host: "127.0.0.1",
    port,
    username: "monitor",
    fingerprint: null as string | null,
  };
  try {
    const fingerprint = await ssh(row, { privateKey: key }, true);
    assert(fingerprint.startsWith("SHA256:"));
    row.fingerprint = fingerprint;
    assert.equal(await ssh(row, { privateKey: key }), "collected");
    row.fingerprint = "SHA256:wrong";
    await assert.rejects(ssh(row, { privateKey: key }));
    row.fingerprint = fingerprint;
    rejectAuth = true;
    await assert.rejects(ssh(row, { privateKey: key }));
    assert.equal(createHash("sha256").update("x").digest().length, 32);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
