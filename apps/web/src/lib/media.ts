import type { SessionUser } from "@familyarchive/auth";
import { getEnv } from "@familyarchive/config";
import {
  getDb,
  mediaDerivatives,
  mediaFaces,
  mediaItems,
  mediaPeople,
  mediaTags,
  tags,
} from "@familyarchive/db";
import { createStorageDriver, type StorageDriver } from "@familyarchive/media";
import { treeRoleAtLeast, type TreeRole } from "@familyarchive/shared";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

export type MediaRow = typeof mediaItems.$inferSelect;
export type TagRow = typeof tags.$inferSelect;

const driverCache = new Map<"local" | "s3", StorageDriver>();

/**
 * Driver by name, so items uploaded before a driver switch keep working:
 * uploads use the configured driver; serving uses the item's stored driver.
 */
export function getStorageDriverFor(name: "local" | "s3"): StorageDriver {
  let cached = driverCache.get(name);
  if (!cached) {
    const env = getEnv();
    cached = createStorageDriver({
      driver: name,
      localPath: env.MEDIA_LOCAL_PATH,
      s3: {
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
      },
    });
    driverCache.set(name, cached);
  }
  return cached;
}

/** The driver new uploads go to. */
export function getStorageDriver(): StorageDriver {
  return getStorageDriverFor(getEnv().MEDIA_STORAGE_DRIVER);
}

/** Metadata editing: editors and up, or contributors for their own uploads (PRD §8.4). */
export function canEditMedia(user: SessionUser | null, role: TreeRole, media: MediaRow): boolean {
  if (!user) return false;
  return (
    treeRoleAtLeast(role, "editor") || (role === "contributor" && media.uploaderId === user.id)
  );
}

export async function getMediaItem(treeId: string, mediaId: string): Promise<MediaRow | null> {
  const rows = await getDb()
    .select()
    .from(mediaItems)
    .where(
      and(eq(mediaItems.id, mediaId), eq(mediaItems.treeId, treeId), isNull(mediaItems.deletedAt)),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Neighbors of an item in the library's grid order (created_at desc, id as
 * tie-break): "previous" is the newer item, "next" the older one. Powers the
 * lightbox arrows; deliberately ignores grid filters (v1 decision).
 */
export async function adjacentMedia(
  treeId: string,
  media: MediaRow,
): Promise<{ prevId: string | null; nextId: string | null }> {
  const db = getDb();
  const scope = and(eq(mediaItems.treeId, treeId), isNull(mediaItems.deletedAt));
  // Compare against the row's own stored (created_at, id) via a subquery —
  // JS Dates lose Postgres's microsecond precision, so passing them as
  // parameters would make an item its own neighbor.
  const anchor = sql`(select m.created_at, m.id from media_items m where m.id = ${media.id})`;
  const [prev, next] = await Promise.all([
    db
      .select({ id: mediaItems.id })
      .from(mediaItems)
      .where(and(scope, sql`(${mediaItems.createdAt}, ${mediaItems.id}) > ${anchor}`))
      .orderBy(asc(mediaItems.createdAt), asc(mediaItems.id))
      .limit(1),
    db
      .select({ id: mediaItems.id })
      .from(mediaItems)
      .where(and(scope, sql`(${mediaItems.createdAt}, ${mediaItems.id}) < ${anchor}`))
      .orderBy(desc(mediaItems.createdAt), desc(mediaItems.id))
      .limit(1),
  ]);
  return { prevId: prev[0]?.id ?? null, nextId: next[0]?.id ?? null };
}

export interface MediaFilters {
  type?: string;
  tagId?: string;
  personId?: string;
  uploaderId?: string;
  collectionId?: string;
}

/** Tree-scoped, soft-delete-aware media listing with M6 filters (PRD §15.3). */
export async function listMedia(treeId: string, filters: MediaFilters): Promise<MediaRow[]> {
  const db = getDb();
  const conditions = [eq(mediaItems.treeId, treeId), isNull(mediaItems.deletedAt)];
  if (filters.type)
    conditions.push(eq(mediaItems.mediaType, filters.type as MediaRow["mediaType"]));
  if (filters.uploaderId) conditions.push(eq(mediaItems.uploaderId, filters.uploaderId));

  let query = db.select({ media: mediaItems }).from(mediaItems).$dynamic();
  if (filters.tagId) {
    query = query.innerJoin(
      mediaTags,
      and(eq(mediaTags.mediaId, mediaItems.id), eq(mediaTags.tagId, filters.tagId)),
    );
  }
  if (filters.personId) {
    // Simple people tags OR assigned face boxes both count (PRD §12.6, §17.6).
    conditions.push(
      sql`(exists (select 1 from media_people mp where mp.media_id = ${mediaItems.id} and mp.person_id = ${filters.personId})
        or exists (select 1 from media_faces mf where mf.media_id = ${mediaItems.id} and mf.person_id = ${filters.personId}))`,
    );
  }
  if (filters.collectionId) {
    conditions.push(
      sql`exists (select 1 from collection_media cm where cm.media_id = ${mediaItems.id} and cm.collection_id = ${filters.collectionId})`,
    );
  }
  const rows = await query.where(and(...conditions)).orderBy(desc(mediaItems.createdAt));
  return rows.map((row) => row.media);
}

/** Media items where a person is tagged (person profile media tab, PRD §12.6). */
export async function listMediaForPerson(treeId: string, personId: string): Promise<MediaRow[]> {
  return listMedia(treeId, { personId });
}

/**
 * mediaId → person ids tagged on it (simple tags + assigned face tags), for
 * branch-view filtering (PRD §10.6). Media absent from the map is untagged.
 */
export async function taggedPersonIdsByMedia(mediaIds: string[]): Promise<Map<string, string[]>> {
  if (mediaIds.length === 0) return new Map();
  const [simple, faces] = await Promise.all([
    getDb()
      .select({ mediaId: mediaPeople.mediaId, personId: mediaPeople.personId })
      .from(mediaPeople)
      .where(inArray(mediaPeople.mediaId, mediaIds)),
    getDb()
      .select({ mediaId: mediaFaces.mediaId, personId: mediaFaces.personId })
      .from(mediaFaces)
      .where(inArray(mediaFaces.mediaId, mediaIds)),
  ]);
  const result = new Map<string, string[]>();
  for (const row of [...simple, ...faces]) {
    if (!row.personId) continue;
    result.set(row.mediaId, [...(result.get(row.mediaId) ?? []), row.personId]);
  }
  return result;
}

export function mediaUrl(treeId: string, mediaId: string): string {
  return `/api/trees/${treeId}/media/${mediaId}/original`;
}

export function derivativeUrl(treeId: string, mediaId: string, derivativeId: string): string {
  return `/api/trees/${treeId}/media/${mediaId}/derivatives/${derivativeId}`;
}

export type DerivativeRow = typeof mediaDerivatives.$inferSelect;

/** Grid thumbnails: mediaId → thumb URL, one query for the whole listing. */
export async function thumbUrls(treeId: string, mediaIds: string[]): Promise<Map<string, string>> {
  if (mediaIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: mediaDerivatives.id, mediaId: mediaDerivatives.mediaId })
    .from(mediaDerivatives)
    .where(and(inArray(mediaDerivatives.mediaId, mediaIds), eq(mediaDerivatives.kind, "thumb")));
  return new Map(rows.map((row) => [row.mediaId, derivativeUrl(treeId, row.mediaId, row.id)]));
}

/** All derivatives of one item, pages in order (detail page PDF previews). */
export async function listDerivatives(mediaId: string): Promise<DerivativeRow[]> {
  return getDb()
    .select()
    .from(mediaDerivatives)
    .where(eq(mediaDerivatives.mediaId, mediaId))
    .orderBy(asc(mediaDerivatives.kind), asc(mediaDerivatives.page));
}

/** The person's profile photo as a servable URL, when set and still valid. */
export async function profilePhotoUrl(
  treeId: string,
  profileMediaId: string | null,
): Promise<string | null> {
  if (!profileMediaId) return null;
  const media = await getMediaItem(treeId, profileMediaId);
  if (!media || !media.mimeType.startsWith("image/")) return null;
  return mediaUrl(treeId, media.id);
}
