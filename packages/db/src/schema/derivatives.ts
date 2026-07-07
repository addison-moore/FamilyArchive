import { bigint, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { mediaItems } from "./media";

/**
 * Generated derivatives of immutable originals (PRD §5.6, §24.5): thumbnails,
 * PDF page previews, video frame grabs. Regenerable — rows and objects are
 * overwritten on reprocess.
 */
export const mediaDerivatives = pgTable(
  "media_derivatives",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    mediaId: text("media_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    /** "thumb" | "pdf_page" | "video_thumb" (shared DERIVATIVE_KINDS). */
    kind: text("kind").notNull(),
    /** 1-based page for pdf_page; 0 otherwise (keeps the uniqueness simple). */
    page: integer("page").notNull().default(0),
    storageDriver: text("storage_driver").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    unique("media_derivatives_media_kind_page_unique").on(table.mediaId, table.kind, table.page),
  ],
);
