import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql as query } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import type { Database } from "../src/db.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "argon2";
import { connect } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { admins } from "../src/schema.js";
const url = process.env.TEST_DATABASE_URL;
test("authenticated CRUD, validation, inbox migration, categories and secret redaction", async () => {
  const pg = url ? null : new PGlite();
  const connection = url ? connect(url) : null;
  const db = connection?.db ?? (drizzle(pg!) as unknown as Database);
  if (pg)
    await pg.exec(
      await readFile(
        new URL("../migrations/001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
  const { app } = await buildApp(db, {
    databaseUrl: url!,
    masterKey: "ab".repeat(32),
    origin: "http://localhost:8080",
    secure: false,
    port: 3000,
  });
  try {
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
    const server = await req("servers", "POST", {
      name: "test",
      host: "localhost",
      username: "test",
      privateKey: "test-private-key",
    });
    assert.equal(server.statusCode, 201);
    assert(!server.body.includes("test-private-key"));
    assert(!server.body.includes('"secret"'));
    const saved = server.json();
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
    assert.equal((await req("docs/json")).statusCode, 200);
    await req("auth/logout", "POST");
    assert.equal((await req("tasks")).statusCode, 401);
  } finally {
    await app.close();
    if (connection) await connection.sql.end();
    if (pg) await pg.close();
  }
});
