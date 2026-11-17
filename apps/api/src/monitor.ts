import ssh2 from "ssh2";
const { Client } = ssh2;
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { servers } from "./schema.js";
import { decrypt } from "./crypto.js";
import type { Database } from "./db.js";
import type { Metrics } from "@hivehub/contracts";
export interface Secret {
  privateKey: string;
  passphrase?: string;
}
export const collector = `export LC_ALL=C
printf 'CPU1 '; head -n 1 /proc/stat
sleep 1
printf 'CPU2 '; head -n 1 /proc/stat
cat /proc/meminfo
printf 'UPTIME '; cat /proc/uptime
printf 'DISKS\\n'; df -Pk -x tmpfs -x devtmpfs
`;
export function parseMetrics(output: string): Metrics {
  const lines = output.split("\n");
  const cpu = (prefix: string) => {
    const line = lines.find((l) => l.startsWith(prefix));
    if (!line) throw new Error("Missing CPU metrics");
    const n = line.trim().split(/\s+/).slice(2).map(Number).slice(0, 8);
    if (n.length < 4 || n.some((x) => !Number.isFinite(x)))
      throw new Error("Invalid CPU metrics");
    return { total: n.reduce((a, b) => a + b, 0), idle: n[3]! + (n[4] || 0) };
  };
  const a = cpu("CPU1 "),
    b = cpu("CPU2 ");
  const total = b.total - a.total;
  const mem = (name: string) =>
    Number(lines.find((l) => l.startsWith(name + ":"))?.split(/\s+/)[1]) * 1024;
  const memory = {
    total: mem("MemTotal"),
    used: mem("MemTotal") - mem("MemAvailable"),
  };
  const uptime = Number(
    lines.find((l) => l.startsWith("UPTIME "))?.split(/\s+/)[1],
  );
  const start = lines.indexOf("DISKS");
  const disks = lines
    .slice(start + 2)
    .filter(Boolean)
    .map((l) => {
      const p = l.trim().split(/\s+/);
      return {
        total: Number(p[1]) * 1024,
        used: Number(p[2]) * 1024,
        mount: p.slice(5).join(" "),
      };
    });
  if (
    total <= 0 ||
    start < 0 ||
    !Number.isFinite(memory.used) ||
    !Number.isFinite(uptime) ||
    disks.some((d) => !Number.isFinite(d.total))
  )
    throw new Error("Invalid metrics output");
  return {
    cpu: Math.max(0, Math.min(100, 100 * (1 - (b.idle - a.idle) / total))),
    memory,
    disks,
    uptime,
  };
}
export function ssh(
  row: {
    host: string;
    port: number;
    username: string;
    fingerprint: string | null;
  },
  secret: Secret,
  probe = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;
    let output = "";
    const done = (error?: Error, value = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.end();
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => done(new Error("连接超时")), 20000);
    client.on("error", () =>
      done(new Error("SSH 连接失败，请检查地址、网络、密钥和主机指纹")),
    );
    client.on("close", () => {
      if (!settled) done(new Error("SSH 连接已关闭"));
    });
    client.on("ready", () =>
      client.exec(collector, (err, stream) => {
        if (err) return done(new Error("无法启动采集"));
        stream.on("data", (data: Buffer) => {
          output += data.toString();
          if (output.length > 1000000) done(new Error("采集输出过大"));
        });
        stream.on("close", (code: number) =>
          code === 0
            ? done(undefined, output)
            : done(new Error("采集脚本执行失败，请确认 Linux 工具和读取权限")),
        );
      }),
    );
    try {
      client.connect({
        host: row.host,
        port: row.port,
        username: row.username,
        privateKey: secret.privateKey,
        passphrase: secret.passphrase,
        readyTimeout: 15000,
        hostVerifier: (key: Buffer) => {
          const fingerprint =
            "SHA256:" +
            createHash("sha256")
              .update(key)
              .digest("base64")
              .replace(/=+$/, "");
          if (probe) {
            done(undefined, fingerprint);
            return false;
          }
          return row.fingerprint === fingerprint;
        },
      });
    } catch {
      done(new Error("SSH 私钥或连接参数无效"));
    }
  });
}
export function monitor(db: Database, key: string) {
  const active = new Set<string>();
  async function refresh(id: string) {
    if (active.has(id)) return { status: "busy" };
    if (active.size >= 5) return { status: "busy" };
    active.add(id);
    try {
      const [row] = await db.select().from(servers).where(eq(servers.id, id));
      if (!row) return { status: "missing" };
      if (!row.fingerprint) return { status: "unverified" };
      await db
        .update(servers)
        .set({ lastAttempt: new Date() })
        .where(eq(servers.id, id));
      try {
        const metrics = parseMetrics(
          await ssh(row, decrypt<Secret>(row.secret, key)),
        );
        await db
          .update(servers)
          .set({ metrics, lastSuccess: new Date(), error: null })
          .where(eq(servers.id, id));
        return { status: "ok" };
      } catch (error) {
        const message = error instanceof Error ? error.message : "采集失败";
        await db
          .update(servers)
          .set({ error: message })
          .where(eq(servers.id, id));
        return { status: "error", message };
      }
    } finally {
      active.delete(id);
    }
  }
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      const rows = await db.select({ id: servers.id }).from(servers);
      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(5, rows.length) }, async () => {
          while (cursor < rows.length) {
            const row = rows[cursor++];
            if (row) await refresh(row.id);
          }
        }),
      );
    } finally {
      running = false;
    }
  }
  return { refresh, tick, isActive: (id: string) => active.has(id) };
}
