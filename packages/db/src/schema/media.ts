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
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { people, places } from "./people";
import { trees } from "./trees";

/**
 * Media library tables (PRD §15, §28.4). Originals are immutable (§5.6): the
 * file columns here describe the stored original; derivatives (M7) get their
 * own table. Media is soft-deleted; queries must filter deleted_at and scope
 * by tree_id (§31.2).
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
    // Date parts (PRD §15.4): exact, partial, approximate, or unknown.
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
    /** Populated by Milestone 8 (OCR) — reserved now per PRD §28.4. */
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
    index("media_items_hash_idx").on(table.treeId, table.hash),
    // Full-text indexes for M10 search over document text (PRD §19.2).
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

/** Simple people tags (PRD §12.6); face-box tags are Milestone 9's media_faces. */
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
