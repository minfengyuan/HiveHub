import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { Type } from "@sinclair/typebox";
import { verify } from "argon2";
import { randomBytes } from "node:crypto";
import { eq, and, gt, lt } from "drizzle-orm";
import {
  Login,
  Named,
  Task,
  Prompt,
  Server,
  type ServerInput,
} from "@hivehub/contracts";
import * as tables from "./schema.js";
import { encrypt, decrypt, sessionHash } from "./crypto.js";
import { monitor, ssh, type Secret } from "./monitor.js";
import type { Database } from "./db.js";
import type { config } from "./config.js";
const Params = Type.Object({ id: Type.String({ format: "uuid" }) });
function fail(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode });
}
export async function buildApp(db: Database, cfg: ReturnType<typeof config>) {
  const app = Fastify({
    logger: { redact: ["req.headers.cookie", "req.headers.authorization"] },
    bodyLimit: 200000,
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(swagger, {
    openapi: { info: { title: "HiveHub API", version: "1.0.0" } },
  });
  const collector = monitor(db, cfg.masterKey);
  const pending = new Map<string, { fingerprint: string; expires: number }>();
  app.setErrorHandler((error, req, reply) => {
    const e = error as Error & {
      statusCode?: number;
      code?: string;
      validation?: unknown;
      cause?: { code?: string };
    };
    const code = e.code ?? e.cause?.code;
    const status = e.validation
      ? 400
      : code === "23503"
        ? 400
        : e.statusCode || 500;
    if (status >= 500)
      req.log.error({ name: e.name, code: e.code }, "Request failed");
    reply.code(status).send({
      error: {
        code: status,
        message:
          status >= 500
            ? "服务暂时不可用"
            : e.validation
              ? "输入格式不正确"
              : code === "23503"
                ? "关联记录不存在"
                : e.message,
      },
    });
  });
  app.addHook("onRequest", async (req, reply) => {
    const path = req.url.split("?")[0];
    if (path === "/health") return;
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== cfg.origin
    )
      fail(403, "请求来源不受信任");
    if (path === "/api/v1/auth/login") return;
    const token = req.cookies.session;
    if (!token) fail(401, "请先登录");
    const [session] = await db
      .select()
      .from(tables.sessions)
      .where(
        and(
          eq(tables.sessions.id, sessionHash(token)),
          gt(tables.sessions.expiresAt, new Date()),
        ),
      );
    if (!session) {
      reply.clearCookie("session", { path: "/" });
      fail(401, "登录已过期");
    }
  });
  app.get("/health", async () => {
    await db.select({ id: tables.lists.id }).from(tables.lists).limit(1);
    return { status: "ok" };
  });
  app.post(
    "/api/v1/auth/login",
    {
      schema: { body: Login },
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const { username, password } = req.body as {
        username: string;
        password: string;
      };
      const [admin] = await db
        .select()
        .from(tables.admins)
        .where(eq(tables.admins.username, username));
      if (!admin || !(await verify(admin.passwordHash, password)))
        fail(401, "用户名或密码错误");
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 86400000);
      await db
        .delete(tables.sessions)
        .where(lt(tables.sessions.expiresAt, new Date()));
      await db
        .insert(tables.sessions)
        .values({ id: sessionHash(token), adminId: admin.id, expiresAt });
      reply.setCookie("session", token, {
        path: "/",
        httpOnly: true,
        secure: cfg.secure,
        sameSite: "strict",
        expires: expiresAt,
      });
      return { username };
    },
  );
  app.get("/api/v1/auth/me", async () => {
    const [admin] = await db
      .select({ username: tables.admins.username })
      .from(tables.admins);
    return admin;
  });
  app.post("/api/v1/auth/logout", async (req, reply) => {
    await db
      .delete(tables.sessions)
      .where(eq(tables.sessions.id, sessionHash(req.cookies.session!)));
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });
  // Each resource owns its schema and table; all updates validate the complete editable record.
  for (const [resource, table, schema] of [
    ["task-lists", tables.lists, Named],
    ["tasks", tables.tasks, Task],
    ["prompt-categories", tables.categories, Named],
    ["prompts", tables.prompts, Prompt],
  ] as const) {
    app.get(`/api/v1/${resource}`, async () => db.select().from(table));
    app.post(
      `/api/v1/${resource}`,
      { schema: { body: schema } },
      async (req, reply) => {
        const [row] = await db
          .insert(table as any)
          .values(req.body as Record<string, unknown>)
          .returning();
        reply.code(201);
        return row;
      },
    );
    app.put(
      `/api/v1/${resource}/:id`,
      { schema: { params: Params, body: schema } },
      async (req) => {
        const { id } = req.params as { id: string };
        const [row] = await db
          .update(table as any)
          .set(req.body as Record<string, unknown>)
          .where(eq(table.id, id))
          .returning();
        if (!row) fail(404, "记录不存在");
        return row;
      },
    );
    app.delete(
      `/api/v1/${resource}/:id`,
      { schema: { params: Params } },
      async (req) => {
        const { id } = req.params as { id: string };
        if (resource === "task-lists") {
          await db.transaction(async (tx) => {
            const [row] = await tx
              .select()
              .from(tables.lists)
              .where(eq(tables.lists.id, id))
              .for("update");
            if (!row) fail(404, "清单不存在");
            if (row.inbox) fail(400, "收件箱不可删除");
            const [inbox] = await tx
              .select()
              .from(tables.lists)
              .where(eq(tables.lists.inbox, true));
            if (!inbox) fail(500, "收件箱缺失");
            await tx
              .update(tables.tasks)
              .set({ listId: inbox.id })
              .where(eq(tables.tasks.listId, id));
            await tx.delete(tables.lists).where(eq(tables.lists.id, id));
          });
        } else {
          const rows = await db
            .delete(table as any)
            .where(eq(table.id, id))
            .returning();
          if (!rows.length) fail(404, "记录不存在");
        }
        return { ok: true };
      },
    );
  }
  function publicServer(row: typeof tables.servers.$inferSelect) {
    const { secret, ...rest } = row;
    return { ...rest, hasPrivateKey: !!secret };
  }
  app.get("/api/v1/servers", async () =>
    (await db.select().from(tables.servers)).map(publicServer),
  );
  async function saveServer(input: ServerInput, id?: string) {
    const [old] = id
      ? await db.select().from(tables.servers).where(eq(tables.servers.id, id))
      : [];
    if (id && !old) fail(404, "服务器不存在");
    if (id && collector.isActive(id)) fail(409, "正在采集，请稍后编辑");
    const { privateKey, passphrase, ...fields } = input;
    if (!old && !privateKey) fail(400, "请输入 SSH 私钥");
    const changed =
      old && (old.host !== input.host || old.port !== (input.port ?? 22));
    const secret = privateKey
      ? encrypt({ privateKey, passphrase }, cfg.masterKey)
      : old!.secret;
    const values = {
      ...fields,
      port: input.port ?? 22,
      secret,
      ...(changed
        ? {
            fingerprint: null,
            metrics: null,
            lastSuccess: null,
            lastAttempt: null,
            error: null,
          }
        : {}),
    };
    if (id) pending.delete(id);
    const [row] = id
      ? await db
          .update(tables.servers)
          .set(values)
          .where(eq(tables.servers.id, id))
          .returning()
      : await db.insert(tables.servers).values(values).returning();
    return publicServer(row!);
  }
  app.post(
    "/api/v1/servers",
    { schema: { body: Server } },
    async (req, reply) => {
      const row = await saveServer(req.body as ServerInput);
      reply.code(201);
      return row;
    },
  );
  app.put(
    "/api/v1/servers/:id",
    { schema: { params: Params, body: Server } },
    async (req) =>
      saveServer(req.body as ServerInput, (req.params as { id: string }).id),
  );
  app.delete(
    "/api/v1/servers/:id",
    { schema: { params: Params } },
    async (req) => {
      const { id } = req.params as { id: string };
      if (collector.isActive(id)) fail(409, "正在采集，请稍后删除");
      const rows = await db
        .delete(tables.servers)
        .where(eq(tables.servers.id, id))
        .returning({ id: tables.servers.id });
      if (!rows.length) fail(404, "服务器不存在");
      pending.delete(id);
      return { ok: true };
    },
  );
  app.post(
    "/api/v1/servers/:id/test",
    {
      schema: { params: Params },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const [row] = await db
        .select()
        .from(tables.servers)
        .where(eq(tables.servers.id, id));
      if (!row) fail(404, "服务器不存在");
      const fingerprint = await ssh(
        row,
        decrypt<Secret>(row.secret, cfg.masterKey),
        true,
      );
      pending.set(id, { fingerprint, expires: Date.now() + 300000 });
      return {
        fingerprint,
        changed: !!row.fingerprint && row.fingerprint !== fingerprint,
      };
    },
  );
  app.post(
    "/api/v1/servers/:id/fingerprint",
    {
      schema: {
        params: Params,
        body: Type.Object(
          { fingerprint: Type.String({ minLength: 1, maxLength: 100 }) },
          { additionalProperties: false },
        ),
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { fingerprint } = req.body as { fingerprint: string };
      const value = pending.get(id);
      if (
        !value ||
        value.expires < Date.now() ||
        value.fingerprint !== fingerprint
      )
        fail(400, "请重新测试连接后确认指纹");
      if (collector.isActive(id)) fail(409, "正在采集，请稍后确认");
      await db
        .update(tables.servers)
        .set({ fingerprint })
        .where(eq(tables.servers.id, id));
      pending.delete(id);
      return { ok: true };
    },
  );
  app.post(
    "/api/v1/servers/:id/refresh",
    { schema: { params: Params } },
    async (req) => collector.refresh((req.params as { id: string }).id),
  );
  await app.register(swaggerUi, { routePrefix: "/api/v1/docs" });
  return { app, collector };
}
