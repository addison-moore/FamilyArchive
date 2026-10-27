import type { MediaType, ProcessingStatus } from "@familyarchive/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { people, places } from "./people";
import { trees } from "./trees";

/**
 * Media library tables. Originals are immutable: the
 * file columns here describe the stored original; derivatives get their
 * own table. Media is soft-deleted; queries must filter deleted_at and scope
 * by tree_id.
 */

export const mediaItems = pgTable(
  "media_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    treeId: text("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    uploaderId: text("uploader_id").references(() => users.id, { onDelete: "set null" }),
    title: text("title"),
    description: text("description"),
    mediaType: text("media_type").$type<MediaType>().notNull(),
    // Date parts: exact, partial, approximate, or unknown.
    dateYear: integer("date_year"),
    dateMonth: integer("date_month"),
    dateDay: integer("date_day"),
    dateApprox: boolean("date_approx").notNull().default(false),
    placeId: text("place_id").references(() => places.id, { onDelete: "set null" }),
    originalFilename: text("original_filename").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    mimeType: text("mime_type").notNull(),
    /** SHA-256 of the original; null only while an upload is in flight. */
    hash: text("hash"),
    storageDriver: text("storage_driver").notNull(),
    storageKey: text("storage_key").notNull(),
    processingStatus: text("processing_status")
      .$type<ProcessingStatus>()
      .notNull()
      .default("pending"),
    /** Raw OCR output; empty until a text job has run. */
    ocrText: text("ocr_text"),
    transcriptionText: text("transcription_text"),
    metadata: jsonb("metadata").notNull().default({}),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
    deletedBy: text("deleted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("media_items_tree_idx").on(table.treeId, table.deletedAt),
    // Unique, not a plain index: duplicate-upload detection is a check then a
    // write, and only the database can arbitrate between two concurrent
    // uploads of the same bytes. Partial on both counts — soft-deleted rows are
    // excluded so a deleted file can be re-uploaded, and placeholder rows
    // (inserted with a null hash before the stream is read) are exempt.
    uniqueIndex("media_items_tree_hash_unique")
      .on(table.treeId, table.hash)
      .where(sql`deleted_at is null and hash is not null`),
    // Full-text search over media text; expression must match lib/search.ts.
    index("media_items_text_search_idx").using(
      "gin",
      sql`to_tsvector('english', coalesce(${table.title}, '') || ' ' || coalesce(${table.description}, ''))`,
    ),
    // Full-text indexes for search over document text.
    index("media_items_ocr_search_idx").using(
      "gin",
      sql`to_tsvector('english', coalesce(${table.ocrText}, ''))`,
    ),
    index("media_items_transcription_search_idx").using(
      "gin",
      sql`to_tsvector('english', coalesce(${table.transcriptionText}, ''))`,
    ),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    treeId: text("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [unique("tags_tree_name_unique").on(table.treeId, table.name)],
);

export const mediaTags = pgTable(
  "media_tags",
  {
    mediaId: text("media_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.mediaId, table.tagId] })],
);

/** Simple people tags; positioned face-box tags live in media_faces. */
export const mediaPeople = pgTable(
  "media_people",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    mediaId: text("media_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    personId: text("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    unique("media_people_media_person_unique").on(table.mediaId, table.personId),
    index("media_people_person_idx").on(table.personId),
  ],
);
