import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { trees } from "./trees";

/**
 * Structured suggestions (PRD §21): members without direct edit access propose
 * corrections; admins review. v1 suggestions are messages attached to a
 * target — accepting records the decision, the admin applies the edit.
 */
export const suggestions = pgTable(
  "suggestions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    treeId: text("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    /** "person" | "media" | "tree" (§21.2). */
    targetType: text("target_type").notNull(),
    /** Person/media id; null for tree-level suggestions. */
    targetId: text("target_id"),
    message: text("message").notNull(),
    suggestedBy: text("suggested_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "open" | "accepted" | "rejected" (§21.4). */
    status: text("status").notNull().default("open"),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { mode: "date" }),
    resolutionNote: text("resolution_note"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("suggestions_tree_status_idx").on(table.treeId, table.status)],
);

/** Admin-visible audit trail (PRD §22, §31.6). Retention enforced by the worker. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    treeId: text("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** e.g. "person.created", "media.tagged", "invite.revoked". */
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    /** Human-readable one-liner shown in the audit view. */
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("audit_logs_tree_created_idx").on(table.treeId, table.createdAt)],
);
