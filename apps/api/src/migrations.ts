import { readFile } from "node:fs/promises";

export const migrationNames = ["001_initial", "002_server_expires_on"] as const;

export function readMigration(name: (typeof migrationNames)[number]) {
  return readFile(new URL(`../migrations/${name}.sql`, import.meta.url), "utf8");
}
