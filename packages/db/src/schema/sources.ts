import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { trees } from "./trees";

/**
 * Import provenance (PRD §10.4): each GEDCOM import into an archive becomes a
 * source record. Sources are not containers — the imported people and
 * relationships live in the archive graph and reference their source.
 */
export const sources = pgTable("sources", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  treeId: text("tree_id")
    .notNull()
    .references(() => trees.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("gedcom"),
  fileName: text("file_name").notNull(),
  importedBy: text("imported_by").references(() => users.id, { onDelete: "set null" }),
  /** People/relationship counts and similar summary numbers. */
  stats: jsonb("stats").notNull().default({}),
  /** Preserved GEDCOM header, parser warnings, etc. */
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
