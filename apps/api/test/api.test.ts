import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql as query } from "drizzle-orm";
import type { Database } from "../src/db.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "argon2";
import { connect } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { migrationNames, readMigration } from "../src/migrations.js";
import { admins, servers } from "../src/schema.js";
const url = process.env.TEST_DATABASE_URL;
test("authenticated CRUD, validation, inbox migration, categories and secret redaction", async () => {
  const pg = url ? null : new PGlite();
  const connection = url ? connect(url) : null;
  const db = connection?.db ?? (drizzle(pg!) as unknown as Database);
  const { app } = await buildApp(db, {
    databaseUrl: url!,
    masterKey: "ab".repeat(32),
    origin: "http://localhost:8080",
    secure: false,
    port: 3000,
  });
  try {
    if (pg) {
      const [initial, ...remaining] = migrationNames;
      await pg.exec(await readMigration(initial));
      await pg.exec(`
        INSERT INTO servers (name, host, username, secret, notes)
        VALUES ('legacy', 'localhost', 'test', 'legacy-secret', 'legacy notes')
      `);
      for (const name of remaining) await pg.exec(await readMigration(name));
      const [legacy] = await db.select().from(servers);
      assert.equal(legacy?.expiresOn, null);
      assert.equal(legacy?.notes, "legacy notes");
      assert.equal(legacy?.secret, "legacy-secret");
    }
    await db.execute(
      query`TRUNCATE admins, task_lists, tasks, prompts, prompt_categories, servers CASCADE`,
    );
    await db.execute(
      query`INSERT INTO task_lists(name,inbox) VALUES ('收件箱',true)`,
    );
    await db.insert(admins).values({
      username: "admin",
      passwordHash: await hash("test-password-123"),
    });
    assert.equal((await app.inject({ url: "/api/v1/tasks" })).statusCode, 401);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          payload: { username: "admin", password: "test-password-123" },
        })
      ).statusCode,
      403,
    );
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin: "http://localhost:8080" },
      payload: { username: "admin", password: "test-password-123" },
    });
    assert.equal(login.statusCode, 200);
    const cookie = login.headers["set-cookie"]!.toString().split(";")[0]!;
    const req = async (
      path: string,
      method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
      payload?: unknown,
    ) =>
      app.inject({
        url: "/api/v1/" + path,
        method,
        headers: { cookie, origin: "http://localhost:8080" },
        payload,
      });
    assert.equal(
      (await req("tasks", "POST", { title: " ", listId: "bad" })).statusCode,
      400,
    );
    assert.equal(
      (
        await req("tasks", "POST", {
          title: "missing list",
          listId: "00000000-0000-4000-8000-000000000000",
        })
      ).statusCode,
      400,
    );
    const list = (await req("task-lists", "POST", { name: "Work" })).json();
    const task = (
      await req("tasks", "POST", {
        title: "Ship",
        notes: "test",
        listId: list.id,
      })
    ).json();
    assert.equal(
      (
        await req("tasks/" + task.id, "PUT", {
          title: "Ship",
          notes: "done",
          listId: list.id,
          completed: true,
        })
      ).json().completed,
      true,
    );
    assert.equal(
      (await req("task-lists/" + list.id, "DELETE")).statusCode,
      200,
    );
    const lists = (await req("task-lists")).json();
    assert.equal((await req("tasks")).json()[0].listId, lists[0].id);
    assert.equal(
      (await req("task-lists/" + lists[0].id, "DELETE")).statusCode,
      400,
    );
    const category = (
      await req("prompt-categories", "POST", { name: "Writing" })
    ).json();
    const prompt = (
      await req("prompts", "POST", {
        title: "Write",
        body: "<script>plain</script>\nbody",
        categoryId: category.id,
        tags: ["draft"],
        favorite: true,
      })
    ).json();
    await req("prompt-categories/" + category.id, "DELETE");
    assert.equal((await req("prompts")).json()[0].categoryId, null);
    assert.equal((await req("prompts")).json()[0].body, prompt.body);
    assert.equal(
      (
        await req("servers", "POST", {
          name: "test",
          host: "localhost",
          username: "test",
        })
      ).statusCode,
      400,
    );
    const serverInput = {
      name: "test",
      host: "localhost",
      username: "test",
    };
    const server = await req("servers", "POST", {
      ...serverInput,
      privateKey: "test-private-key",
      expiresOn: "2028-02-29",
    });
    assert.equal(server.statusCode, 201);
    assert(!server.body.includes("test-private-key"));
    assert(!server.body.includes('"secret"'));
    const saved = server.json();
    assert.equal(saved.expiresOn, "2028-02-29");
    assert.equal((await req("servers")).json()[0].expiresOn, "2028-02-29");
    assert.equal(
      (await req("servers/" + saved.id + "/refresh", "POST")).json().status,
      "unverified",
    );
    assert.equal(
      (
        await req("servers/" + saved.id + "/fingerprint", "POST", {
          fingerprint: "unobserved",
        })
      ).statusCode,
      400,
    );
    const serverPath = "servers/" + saved.id;
    const whereServer = eq(servers.id, saved.id);
    const fingerprint = "fixture-fingerprint";
    await db.update(servers).set({ fingerprint }).where(whereServer);
    const [before] = await db.select().from(servers).where(whereServer);
    assert.equal(
      (await req(serverPath, "PUT", serverInput)).json().expiresOn,
      "2028-02-29",
    );
    for (const expiresOn of [
      "2027-02-29",
      "0000-01-01",
      "",
      "2027-04-30T00:00:00Z",
    ]) {
      assert.equal(
        (await req(serverPath, "PUT", { ...serverInput, expiresOn })).statusCode,
        400,
      );
    }
    assert.equal((await req("servers")).json()[0].expiresOn, "2028-02-29");
    const updated = await req(serverPath, "PUT", {
      ...serverInput,
      expiresOn: "2020-03-01",
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().expiresOn, "2020-03-01");
    assert.equal(updated.json().fingerprint, fingerprint);
    const [after] = await db.select().from(servers).where(whereServer);
    assert.equal(after?.secret, before?.secret);
    const cleared = await req(serverPath, "PUT", {
      ...serverInput,
      expiresOn: null,
    });
    assert.equal(cleared.statusCode, 200);
    assert.equal(cleared.json().expiresOn, null);
    assert.equal((await req("servers")).json()[0].expiresOn, null);
    const withoutDate = await req("servers", "POST", {
      ...serverInput,
      privateKey: "test-private-key",
    });
    assert.equal(withoutDate.statusCode, 201);
    assert.equal(withoutDate.json().expiresOn, null);
    assert.equal((await req("docs/json")).statusCode, 200);
    await req("auth/logout", "POST");
    assert.equal((await req("tasks")).statusCode, 401);
  } finally {
    await app.close();
    if (connection) await connection.sql.end();
    if (pg) await pg.close();
  }
});
