import type { GlobalRole } from "@familyarchive/shared";
import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Auth.js (NextAuth v5) tables per the official Drizzle adapter schema, with
 * FamilyArchive additions: `passwordHash` for email/password auth (PRD §9.1) and
 * created/updated timestamps. Tree-scoped tables (trees, memberships, invites)
 * land in Milestone 2.
 */

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  /** Instance-level role; the first registered user becomes "owner" (PRD §8.1, §30.4). */
  role: text("role").$type<GlobalRole>().notNull().default("user"),
  /**
   * Preferred landing tree (PRD §7.2). Plain column, no FK: a circular
   * users↔trees reference isn't worth it — access is re-checked on every
   * redirect, so a stale value just falls back to the tree list.
   */
  defaultTreeId: text("default_tree_id"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);
