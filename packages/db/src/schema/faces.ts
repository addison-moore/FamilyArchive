import { index, jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { mediaItems } from "./media";
import { people } from "./people";

/**
 * Face boxes (PRD §17, §28.5). Coordinates are normalized (0–1, relative to
 * image dimensions) so they hold across resized derivatives (§17.5). Detection
 * only — recognition/suggestions are out of scope for v1 (§17.3).
 */
export const mediaFaces = pgTable(
  "media_faces",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    mediaId: text("media_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    x: real("x").notNull(),
    y: real("y").notNull(),
    width: real("width").notNull(),
    height: real("height").notNull(),
    confidence: real("confidence"),
    /** "mediapipe" for detected boxes, "manual" for user-drawn ones. */
    detectedBy: text("detected_by").notNull(),
    detectionVersion: text("detection_version"),
    /** Assigned person; null until someone says who this is (§17.6). */
    personId: text("person_id").references(() => people.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("media_faces_media_idx").on(table.mediaId),
    index("media_faces_person_idx").on(table.personId),
  ],
);
