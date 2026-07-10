import { bigint, boolean, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { trees } from "./trees";

/**
 * Archive export bundles (PRD §5.5 portability, §3 amendment 2026-07-09).
 * One live bundle per archive: creating a new export replaces the previous
 * one, and completed bundles expire after EXPORT_RETENTION_DAYS (worker
 * cleanup deletes the storage object and this row).
 */
export const archiveExports = pgTable(
  "archive_exports",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    treeId: text("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by").references(() => users.id, { onDelete: "set null" }),
    /** pending | running | complete | failed (ExportStatus in @familyarchive/shared). */
    status: text("status").notNull().default("pending"),
    includeDeleted: boolean("include_deleted").notNull().default(false),
    storageDriver: text("storage_driver").notNull(),
    storageKey: text("storage_key").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    /** ExportCounts — entry counts mirrored in the bundle's manifest.json. */
    counts: jsonb("counts").notNull().default({}),
    error: text("error"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { mode: "date" }),
    expiresAt: timestamp("expires_at", { mode: "date" }),
  },
  (table) => [index("archive_exports_tree_idx").on(table.treeId)],
);
