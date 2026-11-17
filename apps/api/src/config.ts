export function config(env = process.env) {
  for (const key of ["DATABASE_URL", "MASTER_KEY", "APP_ORIGIN"])
    if (!env[key]) throw new Error(`Missing ${key}`);
  if (!/^[a-fA-F0-9]{64}$/.test(env.MASTER_KEY!))
    throw new Error("MASTER_KEY must contain 64 hex characters");
  const origin = new URL(env.APP_ORIGIN!);
  if (!["http:", "https:"].includes(origin.protocol))
    throw new Error("Invalid APP_ORIGIN");
  return {
    databaseUrl: env.DATABASE_URL!,
    masterKey: env.MASTER_KEY!,
    origin: origin.origin,
    secure: origin.protocol === "https:",
    port: Number(env.PORT || 3000),
  };
}
