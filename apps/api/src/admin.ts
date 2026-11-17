import { hash, argon2id } from "argon2";
import { connect } from "./db.js";
const {
  ADMIN_USERNAME: username,
  ADMIN_PASSWORD: password,
  DATABASE_URL: url,
} = process.env;
if (!username || !password || password.length < 12 || !url)
  throw new Error(
    "Set DATABASE_URL, ADMIN_USERNAME and ADMIN_PASSWORD (at least 12 characters)",
  );
const { sql } = connect(url);
try {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(629852)`;
    const existing = await tx`SELECT id FROM admins LIMIT 1`;
    if (existing.length) throw new Error("Administrator already exists");
    const passwordHash = await hash(password, { type: argon2id });
    await tx`INSERT INTO admins(username,password_hash) VALUES (${username},${passwordHash})`;
  });
  console.log("Administrator created");
} finally {
  await sql.end();
}
