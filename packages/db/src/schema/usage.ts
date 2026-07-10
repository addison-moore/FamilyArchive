import { bigint, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Single-row instance storage counter (storage-quota plan, 2026-07-09):
 * enforcement reads this row instead of summing tables on the upload hot
 * path. Uploads/deletes adjust it; background processing and a nightly
 * worker job recompute it from media_items + media_derivatives to correct
 * any drift. Export bundles are deliberately not counted.
 */
export const instanceUsage = pgTable("instance_usage", {
  id: text("id").primaryKey().default("instance"),
  originalBytes: bigint("original_bytes", { mode: "number" }).notNull().default(0),
  derivativeBytes: bigint("derivative_bytes", { mode: "number" }).notNull().default(0),
  mediaCount: integer("media_count").notNull().default(0),
  /** Highest quota threshold owners were emailed about (0, 90, or 100). */
  notifiedLevel: integer("notified_level").notNull().default(0),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});
