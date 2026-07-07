import type { TreeRole } from "@familyarchive/shared";
import { jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { users } from "./auth";

/**
 * Trees, memberships, and invites (PRD §8–§10). Trees are fully isolated in v1;
 * every domain table added in later milestones references trees.id and every
 * query must filter by it (PRD §31.2).
 */

export const trees = pgTable("trees", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const treeMemberships = pgTable(
  "tree_memberships",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    treeId: text("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<TreeRole>().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [unique("tree_memberships_tree_user_unique").on(table.treeId, table.userId)],
);

export const invites = pgTable("invites", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  treeId: text("tree_id")
    .notNull()
    .references(() => trees.id, { onDelete: "cascade" }),
  /** Role granted on acceptance; invites are tree- and role-scoped (PRD §9.2). */
  role: text("role").$type<TreeRole>().notNull(),
  /** URL token. Multi-use until expiry or revocation; one-time links may come later (PRD §9.2). */
  token: text("token").notNull().unique(),
  /** Address the invite was emailed to, if email delivery was used (PRD §9.3). */
  email: text("email"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  revokedAt: timestamp("revoked_at", { mode: "date" }),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
