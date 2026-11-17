import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import type { Metrics } from "@hivehub/contracts";
const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
export const admins = pgTable("admins", {
  id: id(),
  username: text("username").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
});
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  adminId: uuid("admin_id")
    .references(() => admins.id, { onDelete: "cascade" })
    .notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const lists = pgTable("task_lists", {
  id: id(),
  name: text("name").notNull(),
  inbox: boolean("inbox").default(false).notNull(),
});
export const tasks = pgTable("tasks", {
  id: id(),
  title: text("title").notNull(),
  notes: text("notes").default("").notNull(),
  listId: uuid("list_id")
    .references(() => lists.id)
    .notNull(),
  completed: boolean("completed").default(false).notNull(),
  createdAt: createdAt(),
});
export const categories = pgTable("prompt_categories", {
  id: id(),
  name: text("name").notNull(),
});
export const prompts = pgTable("prompts", {
  id: id(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  tags: jsonb("tags").$type<string[]>().default([]).notNull(),
  favorite: boolean("favorite").default(false).notNull(),
  createdAt: createdAt(),
});
export const servers = pgTable("servers", {
  id: id(),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").default(22).notNull(),
  username: text("username").notNull(),
  secret: text("secret").notNull(),
  group: text("group_name").default("").notNull(),
  tags: jsonb("tags").$type<string[]>().default([]).notNull(),
  notes: text("notes").default("").notNull(),
  fingerprint: text("fingerprint"),
  metrics: jsonb("metrics").$type<Metrics>(),
  lastSuccess: timestamp("last_success", { withTimezone: true }),
  lastAttempt: timestamp("last_attempt", { withTimezone: true }),
  error: text("error"),
});
