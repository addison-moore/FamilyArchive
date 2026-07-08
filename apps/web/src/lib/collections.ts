import { collectionMedia, collections, getDb, mediaItems } from "@familyarchive/db";
import { and, asc, count, desc, eq, isNull } from "drizzle-orm";

import type { MediaRow } from "@/lib/media";

export type CollectionRow = typeof collections.$inferSelect;

export interface CollectionSummary extends CollectionRow {
  mediaCount: number;
}

/** Collections of an archive with member counts, newest first (PRD §16.3). */
export async function listCollections(treeId: string): Promise<CollectionSummary[]> {
  const rows = await getDb()
    .select({
      collection: collections,
      mediaCount: count(collectionMedia.mediaId),
    })
    .from(collections)
    .leftJoin(collectionMedia, eq(collectionMedia.collectionId, collections.id))
    .where(eq(collections.treeId, treeId))
    .groupBy(collections.id)
    .orderBy(desc(collections.createdAt));
  return rows.map((row) => ({ ...row.collection, mediaCount: Number(row.mediaCount) }));
}

export async function getCollection(
  treeId: string,
  collectionId: string,
): Promise<CollectionRow | null> {
  const rows = await getDb()
    .select()
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.treeId, treeId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Non-deleted media of one collection, oldest membership first. */
export async function listCollectionMedia(collectionId: string): Promise<MediaRow[]> {
  const rows = await getDb()
    .select({ media: mediaItems })
    .from(collectionMedia)
    .innerJoin(mediaItems, eq(collectionMedia.mediaId, mediaItems.id))
    .where(and(eq(collectionMedia.collectionId, collectionId), isNull(mediaItems.deletedAt)))
    .orderBy(asc(collectionMedia.createdAt));
  return rows.map((row) => row.media);
}

/** Collections a media item belongs to (PRD §16.1: zero, one, or many). */
export async function collectionsForMedia(
  treeId: string,
  mediaId: string,
): Promise<CollectionRow[]> {
  const rows = await getDb()
    .select({ collection: collections })
    .from(collectionMedia)
    .innerJoin(collections, eq(collectionMedia.collectionId, collections.id))
    .where(and(eq(collectionMedia.mediaId, mediaId), eq(collections.treeId, treeId)))
    .orderBy(asc(collections.name));
  return rows.map((row) => row.collection);
}
