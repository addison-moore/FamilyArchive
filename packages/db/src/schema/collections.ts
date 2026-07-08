import { integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { mediaItems } from "./media";
import { trees } from "./trees";

/**
 * Collections (PRD §16, §28.6): named groups of media within an archive. A
 * media item may belong to any number of collections. Hard-deleted — removing
 * a collection never touches its media.
 */
export const collections = pgTable("collections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  treeId: text("tree_id")
    .notNull()
    .references(() => trees.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  /** Optional date range (PRD §16.2), year granularity. */
  startYear: integer("start_year"),
  endYear: integer("end_year"),
  coverMediaId: text("cover_media_id").references(() => mediaItems.id, {
    onDelete: "set null",
  }),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const collectionMedia = pgTable(
  "collection_media",
  {
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    mediaId: text("media_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.collectionId, table.mediaId] })],
);
