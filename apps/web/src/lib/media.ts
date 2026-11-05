import type { SessionUser } from "@familyarchive/auth";
import { getEnv } from "@familyarchive/config";
import { getDb, mediaDerivatives, mediaItems, mediaTags } from "@familyarchive/db";
import { storageDriverFromEnv, type StorageDriver } from "@familyarchive/media";
import {
  isBrowserRenderableImage,
  isImageMime,
  treeRoleAtLeast,
  type TreeRole,
} from "@familyarchive/shared";
import { and, asc, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";

export type MediaRow = typeof mediaItems.$inferSelect;

/**
 * Driver by name, so items uploaded before a driver switch keep working:
 * uploads use the configured driver; serving uses the item's stored driver.
 */
export function getStorageDriverFor(name: "local" | "s3"): StorageDriver {
  return storageDriverFromEnv(name, getEnv());
}

/** The driver new uploads go to. */
export function getStorageDriver(): StorageDriver {
  return getStorageDriverFor(getEnv().MEDIA_STORAGE_DRIVER);
}

/** Metadata editing: editors and up, or contributors for their own uploads. */
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

/**
 * Branch view rule: media tagged with at least one of these people, plus media
 * tagged with nobody, which belongs to the whole archive and stays visible. A
 * self-contained parenthesized group, so it is safe inside any `and()`.
 */
export function branchMediaCondition(branchIds: Set<string>): SQL {
  const ids = [...branchIds];
  const inBranch =
    ids.length > 0
      ? sql`exists (select 1 from media_people mp where mp.media_id = ${mediaItems.id} and mp.person_id in ${ids})
          or exists (select 1 from media_faces mf where mf.media_id = ${mediaItems.id} and mf.person_id in ${ids})`
      : sql`false`;
  return sql`(not exists (select 1 from media_people mp where mp.media_id = ${mediaItems.id})
    and not exists (select 1 from media_faces mf where mf.media_id = ${mediaItems.id} and mf.person_id is not null)
    or (${inBranch}))`;
}

interface MediaFilters {
  type?: string;
  tagId?: string;
  personId?: string;
  uploaderId?: string;
  collectionId?: string;
  /**
   * Branch view (see branchMediaCondition). Applied in SQL rather than after the
   * fact so it composes with limit/offset — filtering a page in memory would
   * silently return short pages.
   */
  branchIds?: Set<string> | null;
}

/** Shared WHERE for the media listing and its count, so the two cannot drift. */
function mediaConditions(treeId: string, filters: MediaFilters): SQL[] {
  const conditions: SQL[] = [eq(mediaItems.treeId, treeId), isNull(mediaItems.deletedAt)];
  if (filters.type)
    conditions.push(eq(mediaItems.mediaType, filters.type as MediaRow["mediaType"]));
  if (filters.uploaderId) conditions.push(eq(mediaItems.uploaderId, filters.uploaderId));
  if (filters.personId) {
    // Simple people tags OR assigned face boxes both count.
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
  if (filters.branchIds) conditions.push(branchMediaCondition(filters.branchIds));
  return conditions;
}

/** Tree-scoped, soft-delete-aware media listing with the library filters. */
export async function listMedia(
  treeId: string,
  filters: MediaFilters,
  page?: { limit: number; offset: number },
): Promise<MediaRow[]> {
  const db = getDb();
  let query = db.select({ media: mediaItems }).from(mediaItems).$dynamic();
  if (filters.tagId) {
    query = query.innerJoin(
      mediaTags,
      and(eq(mediaTags.mediaId, mediaItems.id), eq(mediaTags.tagId, filters.tagId)),
    );
  }
  query = query
    .where(and(...mediaConditions(treeId, filters)))
    .orderBy(desc(mediaItems.createdAt), desc(mediaItems.id));
  if (page) query = query.limit(page.limit).offset(page.offset);
  const rows = await query;
  return rows.map((row) => row.media);
}

/** Total matching the same filters, for the pager. */
export async function countMedia(treeId: string, filters: MediaFilters): Promise<number> {
  const db = getDb();
  let query = db.select({ value: count() }).from(mediaItems).$dynamic();
  if (filters.tagId) {
    query = query.innerJoin(
      mediaTags,
      and(eq(mediaTags.mediaId, mediaItems.id), eq(mediaTags.tagId, filters.tagId)),
    );
  }
  const rows = await query.where(and(...mediaConditions(treeId, filters)));
  return Number(rows[0]?.value ?? 0);
}

/** Media items where a person is tagged (person profile media tab). */
export async function listMediaForPerson(treeId: string, personId: string): Promise<MediaRow[]> {
  return listMedia(treeId, { personId });
}

export function mediaUrl(treeId: string, mediaId: string): string {
  return `/api/trees/${treeId}/media/${mediaId}/original`;
}

export function derivativeUrl(treeId: string, mediaId: string, derivativeId: string): string {
  return `/api/trees/${treeId}/media/${mediaId}/derivatives/${derivativeId}`;
}

/**
 * Grid thumbnails: mediaId → thumb URL, one query for the whole listing. Live items
 * only, since the route refuses a deleted item's derivatives: a collection whose
 * cover had been deleted kept linking to it and showed a broken image.
 */
export async function thumbUrls(treeId: string, mediaIds: string[]): Promise<Map<string, string>> {
  if (mediaIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: mediaDerivatives.id, mediaId: mediaDerivatives.mediaId })
    .from(mediaDerivatives)
    .innerJoin(mediaItems, eq(mediaDerivatives.mediaId, mediaItems.id))
    .where(
      and(
        inArray(mediaDerivatives.mediaId, mediaIds),
        eq(mediaDerivatives.kind, "thumb"),
        eq(mediaItems.treeId, treeId),
        isNull(mediaItems.deletedAt),
      ),
    );
  return new Map(rows.map((row) => [row.mediaId, derivativeUrl(treeId, row.mediaId, row.id)]));
}

/** All derivatives of one item, pages in order (detail page PDF previews). */
export async function listDerivatives(mediaId: string) {
  return getDb()
    .select()
    .from(mediaDerivatives)
    .where(eq(mediaDerivatives.mediaId, mediaId))
    .orderBy(asc(mediaDerivatives.kind), asc(mediaDerivatives.page));
}

/**
 * The person's profile photo as a servable URL, when set and still valid. The
 * thumbnail where there is one: an avatar has no use for a full-size scan, and an
 * original in HEIC or TIFF would not display in an `<img>` at all.
 */
export async function profilePhotoUrl(
  treeId: string,
  profileMediaId: string | null,
): Promise<string | null> {
  if (!profileMediaId) return null;
  const media = await getMediaItem(treeId, profileMediaId);
  if (!media || !isImageMime(media.mimeType)) return null;
  const thumb = (await thumbUrls(treeId, [media.id])).get(media.id);
  if (thumb) return thumb;
  return isBrowserRenderableImage(media.mimeType) ? mediaUrl(treeId, media.id) : null;
}
