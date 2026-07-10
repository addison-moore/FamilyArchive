import { eq, sql } from "drizzle-orm";

import { getDb } from "./client";
import { mediaDerivatives, mediaItems } from "./schema";
import { instanceUsage } from "./schema/usage";

export type InstanceUsage = typeof instanceUsage.$inferSelect;

const ROW_ID = "instance";

/** Current usage counter (creates the row on first read). */
export async function getInstanceUsage(): Promise<InstanceUsage> {
  const db = getDb();
  const rows = await db.select().from(instanceUsage).where(eq(instanceUsage.id, ROW_ID));
  if (rows[0]) return rows[0];
  await db.insert(instanceUsage).values({ id: ROW_ID }).onConflictDoNothing();
  return recomputeInstanceUsage();
}

/** Fast counter adjustment for the upload/delete hot paths. */
export async function adjustInstanceUsage(delta: {
  originalBytes?: number;
  mediaCount?: number;
}): Promise<void> {
  const db = getDb();
  await db.insert(instanceUsage).values({ id: ROW_ID }).onConflictDoNothing();
  await db
    .update(instanceUsage)
    .set({
      originalBytes: sql`greatest(0, ${instanceUsage.originalBytes} + ${delta.originalBytes ?? 0})`,
      mediaCount: sql`greatest(0, ${instanceUsage.mediaCount} + ${delta.mediaCount ?? 0})`,
      updatedAt: new Date(),
    })
    .where(eq(instanceUsage.id, ROW_ID));
}

/**
 * Recompute the counter from the source tables (drift correction). Soft-deleted
 * media still occupies disk, so it counts until it is hard-deleted.
 */
export async function recomputeInstanceUsage(): Promise<InstanceUsage> {
  const db = getDb();
  // All rows, including soft-deleted — those files remain on disk until
  // hard-deleted.
  const [originals] = await db
    .select({
      bytes: sql<number>`coalesce(sum(${mediaItems.fileSize}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(mediaItems);
  const [derivatives] = await db
    .select({ bytes: sql<number>`coalesce(sum(${mediaDerivatives.fileSize}), 0)::bigint` })
    .from(mediaDerivatives);

  await db.insert(instanceUsage).values({ id: ROW_ID }).onConflictDoNothing();
  const updated = await db
    .update(instanceUsage)
    .set({
      originalBytes: Number(originals?.bytes ?? 0),
      derivativeBytes: Number(derivatives?.bytes ?? 0),
      mediaCount: Number(originals?.count ?? 0),
      updatedAt: new Date(),
    })
    .where(eq(instanceUsage.id, ROW_ID))
    .returning();
  return updated[0]!;
}

/** Record the highest notified quota threshold (0 resets when usage drops). */
export async function setUsageNotifiedLevel(level: 0 | 90 | 100): Promise<void> {
  await getDb()
    .update(instanceUsage)
    .set({ notifiedLevel: level })
    .where(eq(instanceUsage.id, ROW_ID));
}
