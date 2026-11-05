import {
  auditLogs,
  getDb,
  isPurgeStarted,
  isUniqueViolation,
  mediaDerivatives,
  mediaItems,
  mergeMediaMetadata,
  people,
  recomputeInstanceUsage,
  users,
} from "@familyarchive/db";
import { isMissingObject, mediaPrefix, UnsatisfiableRangeError } from "@familyarchive/media";
import {
  formatLifespan,
  isFaceDetectionEligible,
  isOcrEligible,
  type MediaType,
} from "@familyarchive/shared";
import { and, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { recordAudit } from "@/lib/audit";
import { enqueueFaceDetection, enqueueMediaProcessing, enqueueOcr } from "@/lib/jobs";
import { getStorageDriverFor, type MediaRow } from "@/lib/media";
import { maybeNotifyOwners } from "@/lib/quota";

/**
 * Trash (PRD §5.8): soft-deleted people and media, restoring them, and permanently
 * removing them. This module and deleting a whole archive are the only places that
 * hard-delete either, and the only paths by which an original leaves storage. Uploads
 * that never finished are cleared elsewhere, but they have no original.
 */

/** A restore or removal refused for a reason the person can act on; they see its message. */
export class TrashError extends Error {
  constructor(
    message: string,
    /** The live copy blocking a restore, so the message can link to it. */
    readonly duplicateOf?: string,
  ) {
    super(message);
    this.name = "TrashError";
  }
}

const NO_LONGER_IN_TRASH = "That item is no longer in Trash.";
const REMOVAL_STARTED =
  "An admin started permanently removing this item, so it can't be restored. Part of it may already be gone.";

export type TrashView = "media" | "people" | "merged";

export function parseTrashView(value: unknown): TrashView {
  return value === "people" || value === "merged" ? value : "media";
}

export function trashUrl(treeId: string, view: TrashView, params: Record<string, string> = {}) {
  return `/trees/${treeId}/trash?${new URLSearchParams({ view, ...params })}`;
}

export function trashThumbUrl(treeId: string, mediaId: string): string {
  return `/api/trees/${treeId}/trash/media/${mediaId}/thumb`;
}

function driverName(storageDriver: string): "local" | "s3" {
  return storageDriver === "s3" ? "s3" : "local";
}

/**
 * Finalized media in this archive's Trash. A null hash is an upload that never
 * finished: there is nothing to restore, and the nightly sweep clears those rows.
 */
function trashedMediaScope(treeId: string) {
  return and(
    eq(mediaItems.treeId, treeId),
    isNotNull(mediaItems.deletedAt),
    isNotNull(mediaItems.hash),
  );
}

const purgeNotStarted = sql`${mediaItems.metadata} -> 'purge' is null`;
const mergedInto = sql<string | null>`${people.metadata} ->> 'mergedInto'`;

/** What the archive's Trash holds. `bytes` is what removing all of its media would free. */
export async function trashSummary(treeId: string) {
  const db = getDb();
  const [[media], [derivatives], [person]] = await Promise.all([
    db
      .select({
        items: count(),
        bytes: sql<string>`coalesce(sum(${mediaItems.fileSize}), 0)`,
      })
      .from(mediaItems)
      .where(trashedMediaScope(treeId)),
    db
      .select({ bytes: sql<string>`coalesce(sum(${mediaDerivatives.fileSize}), 0)` })
      .from(mediaDerivatives)
      .innerJoin(mediaItems, eq(mediaDerivatives.mediaId, mediaItems.id))
      .where(trashedMediaScope(treeId)),
    db
      .select({
        people: sql<number>`(count(*) filter (where ${mergedInto} is null))::int`,
        merged: sql<number>`(count(*) filter (where ${mergedInto} is not null))::int`,
      })
      .from(people)
      .where(and(eq(people.treeId, treeId), isNotNull(people.deletedAt))),
  ]);
  return {
    media: media?.items ?? 0,
    people: person?.people ?? 0,
    merged: person?.merged ?? 0,
    bytes: Number(media?.bytes ?? 0) + Number(derivatives?.bytes ?? 0),
  };
}

export interface TrashedMedia {
  id: string;
  name: string;
  mediaType: MediaType;
  /** The original plus its derivatives. */
  bytes: number;
  deletedAt: Date | null;
  deletedByName: string | null;
  /** A permanent removal started and didn't finish, so this can only be removed now. */
  removing: boolean;
  hasThumb: boolean;
}

export async function listTrashedMedia(
  treeId: string,
  page: { limit: number; offset: number },
): Promise<TrashedMedia[]> {
  const rows = await getDb()
    .select({
      id: mediaItems.id,
      title: mediaItems.title,
      originalFilename: mediaItems.originalFilename,
      mediaType: mediaItems.mediaType,
      fileSize: mediaItems.fileSize,
      deletedAt: mediaItems.deletedAt,
      deletedByName: users.name,
      removing: sql<boolean>`${mediaItems.metadata} -> 'purge' is not null`,
      derivativeBytes: sql<string>`(select coalesce(sum(d.file_size), 0) from media_derivatives d where d.media_id = ${mediaItems.id})`,
      hasThumb: sql<boolean>`exists (select 1 from media_derivatives d where d.media_id = ${mediaItems.id} and d.kind = 'thumb')`,
    })
    .from(mediaItems)
    .leftJoin(users, eq(users.id, mediaItems.deletedBy))
    .where(trashedMediaScope(treeId))
    .orderBy(desc(mediaItems.deletedAt), desc(mediaItems.id))
    .limit(page.limit)
    .offset(page.offset);
  return rows.map((row) => ({
    id: row.id,
    name: row.title || row.originalFilename,
    mediaType: row.mediaType,
    bytes: row.fileSize + Number(row.derivativeBytes),
    deletedAt: row.deletedAt,
    deletedByName: row.deletedByName,
    removing: row.removing,
    hasThumb: row.hasThumb,
  }));
}

export interface TrashedPerson {
  id: string;
  fullName: string;
  lifespan: string | null;
  deletedAt: Date | null;
  deletedByName: string | null;
  /** Set for a merged-away record, which can never be restored (PRD §10.5). */
  mergedInto: {
    id: string;
    /** Null once the survivor has itself been permanently removed. */
    name: string | null;
    /** False when the survivor is itself in Trash, so it has no page to link to. */
    live: boolean;
  } | null;
}

export async function listTrashedPeople(
  treeId: string,
  view: "people" | "merged",
  page: { limit: number; offset: number },
): Promise<TrashedPerson[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: people.id,
      fullName: people.fullName,
      birthYear: people.birthYear,
      birthMonth: people.birthMonth,
      birthDay: people.birthDay,
      birthApprox: people.birthApprox,
      deathYear: people.deathYear,
      deathMonth: people.deathMonth,
      deathDay: people.deathDay,
      deathApprox: people.deathApprox,
      deletedAt: people.deletedAt,
      deletedByName: users.name,
      mergedIntoId: mergedInto,
    })
    .from(people)
    .leftJoin(users, eq(users.id, people.deletedBy))
    .where(
      and(
        eq(people.treeId, treeId),
        isNotNull(people.deletedAt),
        view === "merged" ? sql`${mergedInto} is not null` : sql`${mergedInto} is null`,
      ),
    )
    .orderBy(desc(people.deletedAt), desc(people.id))
    .limit(page.limit)
    .offset(page.offset);

  const survivorIds = [...new Set(rows.flatMap((row) => row.mergedIntoId ?? []))];
  const survivors =
    survivorIds.length > 0
      ? await db
          .select({ id: people.id, fullName: people.fullName, deletedAt: people.deletedAt })
          .from(people)
          .where(and(eq(people.treeId, treeId), inArray(people.id, survivorIds)))
      : [];
  const survivorById = new Map(survivors.map((survivor) => [survivor.id, survivor]));

  return rows.map((row) => {
    const survivor = row.mergedIntoId ? survivorById.get(row.mergedIntoId) : undefined;
    return {
      id: row.id,
      fullName: row.fullName,
      lifespan: formatLifespan(
        {
          year: row.birthYear,
          month: row.birthMonth,
          day: row.birthDay,
          approx: row.birthApprox,
        },
        {
          year: row.deathYear,
          month: row.deathMonth,
          day: row.deathDay,
          approx: row.deathApprox,
        },
      ),
      deletedAt: row.deletedAt,
      deletedByName: row.deletedByName,
      mergedInto: row.mergedIntoId
        ? {
            id: row.mergedIntoId,
            name: survivor?.fullName ?? null,
            live: Boolean(survivor && !survivor.deletedAt),
          }
        : null,
    };
  });
}

/** The thumbnail of an item in this archive's Trash, or null. */
export async function trashedThumbnail(treeId: string, mediaId: string) {
  const rows = await getDb()
    .select({
      storageDriver: mediaDerivatives.storageDriver,
      storageKey: mediaDerivatives.storageKey,
      mimeType: mediaDerivatives.mimeType,
    })
    .from(mediaDerivatives)
    .innerJoin(mediaItems, eq(mediaDerivatives.mediaId, mediaItems.id))
    .where(
      and(
        eq(mediaDerivatives.mediaId, mediaId),
        eq(mediaDerivatives.kind, "thumb"),
        trashedMediaScope(treeId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Work that was skipped while an item sat in Trash. Workers return early on a deleted
 * item, so anything queued before the delete was consumed without running. Without
 * this, an item deleted just after upload comes back on "Preparing…", or on "Reading
 * the text…" with no job behind it.
 */
export function jobsToResume(
  media: Pick<MediaRow, "processingStatus" | "mediaType" | "mimeType" | "metadata">,
): { processing: boolean; ocr: boolean; faces: boolean; aiInterrupted: boolean } {
  const meta = media.metadata as {
    ocr?: { status?: string };
    ai?: { status?: string };
    faces?: { status?: string };
  };
  const status = media.processingStatus;
  const processed = status === "processed";
  const neverFinished = (jobStatus?: string) => jobStatus !== "done" && jobStatus !== "failed";
  return {
    processing: status === "pending" || status === "processing" || status === "retrying",
    // A processing job continues into OCR and face detection by itself. After a failed
    // one, the person already has a retry that does the same.
    ocr: processed && isOcrEligible(media.mediaType) && neverFinished(meta.ocr?.status),
    faces:
      processed &&
      isFaceDetectionEligible(media.mediaType, media.mimeType) &&
      neverFinished(meta.faces?.status),
    // Marked failed rather than re-run: that would send family data to an external
    // provider when nobody just asked for it (PRD §31.4).
    aiInterrupted: meta.ai?.status === "queued" || meta.ai?.status === "running",
  };
}

/** Put a media item back in the library, with its tags, collections and files as they were. */
export async function restoreMedia(
  treeId: string,
  mediaId: string,
  actorId: string,
): Promise<void> {
  const db = getDb();
  const scope = and(eq(mediaItems.id, mediaId), trashedMediaScope(treeId));
  const [media] = await db
    .select({
      title: mediaItems.title,
      originalFilename: mediaItems.originalFilename,
      hash: mediaItems.hash,
      mediaType: mediaItems.mediaType,
      mimeType: mediaItems.mimeType,
      processingStatus: mediaItems.processingStatus,
      metadata: mediaItems.metadata,
      deletedAt: mediaItems.deletedAt,
      deletedBy: mediaItems.deletedBy,
    })
    .from(mediaItems)
    .where(scope)
    .limit(1);
  if (!media) throw new TrashError(NO_LONGER_IN_TRASH);
  if (isPurgeStarted(media.metadata)) throw new TrashError(REMOVAL_STARTED);

  const jobs = jobsToResume(media);
  let restored: { id: string }[];
  try {
    // Conditional on the state read above, because a purge can start at any moment:
    // bringing a row back while its files are being deleted would leave a live
    // record with nothing behind it.
    restored = await db
      .update(mediaItems)
      .set({
        deletedAt: null,
        deletedBy: null,
        updatedAt: new Date(),
        ...(jobs.processing ? { processingStatus: "pending" as const } : {}),
      })
      .where(and(scope, purgeNotStarted))
      .returning({ id: mediaItems.id });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // The same bytes were uploaded again while this copy was in Trash.
    const [live] = await db
      .select({ id: mediaItems.id })
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.treeId, treeId),
          eq(mediaItems.hash, media.hash ?? ""),
          isNull(mediaItems.deletedAt),
        ),
      )
      .limit(1);
    throw new TrashError(
      "An identical copy of this file is already in the library, so this one can't be restored. An admin can permanently remove this one.",
      live?.id,
    );
  }
  if (!restored[0]) throw new TrashError(NO_LONGER_IN_TRASH);

  if (jobs.aiInterrupted) {
    await db
      .update(mediaItems)
      .set({
        metadata: mergeMediaMetadata("ai", {
          status: "failed",
          error: "Interrupted when this item was deleted",
          updatedAt: new Date().toISOString(),
        }),
      })
      .where(eq(mediaItems.id, mediaId));
  }
  // Best effort: the item is back either way, and its page offers to retry each of these.
  const queueFailed = (error: unknown) =>
    console.error(`restore: could not queue work for ${mediaId}:`, error);
  if (jobs.processing) await enqueueMediaProcessing(treeId, mediaId).catch(queueFailed);
  if (jobs.ocr) await enqueueOcr(treeId, mediaId).catch(queueFailed);
  if (jobs.faces) await enqueueFaceDetection(treeId, mediaId).catch(queueFailed);

  await recordAudit({
    treeId,
    actorId,
    action: "media.restored",
    targetType: "media",
    targetId: mediaId,
    summary: `Restored media ${media.title || media.originalFilename} from Trash`,
    metadata: { deletedAt: media.deletedAt, deletedBy: media.deletedBy },
  });
}

/** Put a person back, with the relationships and tags that were never removed. */
export async function restorePerson(
  treeId: string,
  personId: string,
  actorId: string,
): Promise<void> {
  const db = getDb();
  const scope = and(
    eq(people.id, personId),
    eq(people.treeId, treeId),
    isNotNull(people.deletedAt),
  );
  const [person] = await db
    .select({
      fullName: people.fullName,
      mergedIntoId: mergedInto,
      deletedAt: people.deletedAt,
      deletedBy: people.deletedBy,
    })
    .from(people)
    .where(scope)
    .limit(1);
  if (!person) throw new TrashError(NO_LONGER_IN_TRASH);
  if (person.mergedIntoId) {
    // A merge records nothing about what came from whom, so restoring could only add
    // an unconnected copy of someone whose relationships now belong to the survivor.
    throw new TrashError(
      `${person.fullName} was merged into another person and can't be restored.`,
    );
  }

  const restored = await db
    .update(people)
    .set({ deletedAt: null, deletedBy: null, updatedAt: new Date() })
    .where(and(scope, sql`${mergedInto} is null`))
    .returning({ id: people.id });
  if (!restored[0]) throw new TrashError(NO_LONGER_IN_TRASH);

  await recordAudit({
    treeId,
    actorId,
    action: "person.restored",
    targetType: "person",
    targetId: personId,
    summary: `Restored person ${person.fullName} from Trash`,
    metadata: { deletedAt: person.deletedAt, deletedBy: person.deletedBy },
  });
}

/**
 * Permanently remove a media item: its files, then its record.
 *
 * The record goes last, unlike deleting an archive, because it is what locates the
 * files and what counts them. Gone first, a failed file delete would leave bytes
 * nothing can find, with the quota reporting them as free.
 *
 * Throughout, an unmarked row in Trash still has its original, and a row that may
 * have lost its original is marked. A retry from any point finishes the job.
 */
export async function purgeMedia(treeId: string, mediaId: string, actorId: string): Promise<void> {
  const db = getDb();
  const scope = and(eq(mediaItems.id, mediaId), trashedMediaScope(treeId));
  const [media] = await db
    .select({
      title: mediaItems.title,
      originalFilename: mediaItems.originalFilename,
      mimeType: mediaItems.mimeType,
      fileSize: mediaItems.fileSize,
      hash: mediaItems.hash,
      storageDriver: mediaItems.storageDriver,
      storageKey: mediaItems.storageKey,
      uploaderId: mediaItems.uploaderId,
      deletedAt: mediaItems.deletedAt,
      deletedBy: mediaItems.deletedBy,
    })
    .from(mediaItems)
    .where(scope)
    .limit(1);
  if (!media) throw new TrashError(NO_LONGER_IN_TRASH);

  const derivatives = await db
    .select({
      storageDriver: mediaDerivatives.storageDriver,
      fileSize: mediaDerivatives.fileSize,
    })
    .from(mediaDerivatives)
    .where(eq(mediaDerivatives.mediaId, mediaId));
  // Every driver that holds part of it, which covers items from before a driver switch.
  const drivers = new Set([media, ...derivatives].map((row) => driverName(row.storageDriver)));
  const prefix = mediaPrefix(treeId, mediaId);

  // 1. Before changing anything, check storage can be reached, so an outage or a
  //    missing setting leaves the item untouched and still restorable.
  try {
    for (const name of drivers) getStorageDriverFor(name);
    if (media.storageKey) {
      const original = await getStorageDriverFor(driverName(media.storageDriver)).getStream(
        media.storageKey,
        { start: 0, end: 0 },
      );
      original.stream.on("error", () => {});
      original.stream.destroy();
    }
  } catch (error) {
    // An original already missing is no reason to keep its record.
    if (!isMissingObject(error) && !(error instanceof UnsatisfiableRangeError)) {
      console.error(`purge: storage check failed for ${mediaId}:`, error);
      throw new TrashError("Storage can't be reached right now, so nothing was removed.");
    }
  }

  // 2. Past this point it can't be restored. The row lock settles a race with a restore:
  //    whichever runs first, the other finds nothing to update.
  const marked = await db
    .update(mediaItems)
    .set({
      metadata: mergeMediaMetadata("purge", {
        startedAt: new Date().toISOString(),
        startedBy: actorId,
      }),
    })
    .where(scope)
    .returning({ id: mediaItems.id });
  if (!marked[0]) throw new TrashError(NO_LONGER_IN_TRASH);

  // 3. The files.
  try {
    for (const name of drivers) await getStorageDriverFor(name).deletePrefix(prefix);
  } catch (error) {
    console.error(`purge: could not remove the files of ${mediaId}:`, error);
    throw new TrashError(
      "Some of this item's files couldn't be removed. It stays in Trash, but part of it may be gone, so it can only be removed now. Try again.",
    );
  }

  // 4. The record, with the one reference that has no foreign key (soft-deleted people
  //    included, or restoring one later brings a dangling photo back), and the audit
  //    entry, which exists exactly when the removal happened. recordAudit swallows
  //    errors, which is wrong for something that can't be undone.
  await db.transaction(async (tx) => {
    const removed = await tx.delete(mediaItems).where(scope).returning({ id: mediaItems.id });
    // Someone else's retry got here first, and wrote the audit entry.
    if (!removed[0]) return;
    await tx
      .update(people)
      .set({ profileMediaId: null, updatedAt: new Date() })
      .where(and(eq(people.treeId, treeId), eq(people.profileMediaId, mediaId)));
    await tx.insert(auditLogs).values({
      treeId,
      actorId,
      action: "media.purged",
      targetType: "media",
      targetId: mediaId,
      summary: `Permanently removed media ${media.title || media.originalFilename}`,
      metadata: {
        title: media.title,
        originalFilename: media.originalFilename,
        mimeType: media.mimeType,
        fileSize: media.fileSize,
        hash: media.hash,
        storageDriver: media.storageDriver,
        derivativeCount: derivatives.length,
        derivativeBytes: derivatives.reduce((sum, row) => sum + row.fileSize, 0),
        uploaderId: media.uploaderId,
        deletedAt: media.deletedAt,
        deletedBy: media.deletedBy,
      },
    });
  });

  // 5. A job running through step 3 may have stored a preview since. With the row gone
  //    any later write fails its insert and removes its own file (worker media.ts), so
  //    this closes the window. The removal has happened, so failing here isn't an error.
  for (const name of drivers) {
    await getStorageDriverFor(name)
      .deletePrefix(prefix)
      .catch((error: unknown) => console.error(`purge: second sweep of ${mediaId} failed:`, error));
  }

  // 6. Space freed. Also resets the 90%/100% notice state; the nightly recompute would
  //    correct the counter if this fails.
  await recomputeInstanceUsage()
    .then(maybeNotifyOwners)
    .catch((error: unknown) => console.error("purge: quota bookkeeping failed:", error));
}

/**
 * Permanently remove a person. Their names, relationships and photo tags cascade away,
 * face boxes stay unassigned, and starting-person preferences clear (all foreign keys).
 * Their media stays in the library.
 */
export async function purgePerson(
  treeId: string,
  personId: string,
  actorId: string,
): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [person] = await tx
      .delete(people)
      .where(and(eq(people.id, personId), eq(people.treeId, treeId), isNotNull(people.deletedAt)))
      .returning({
        fullName: people.fullName,
        birthYear: people.birthYear,
        deathYear: people.deathYear,
        sourceId: people.sourceId,
        mergedIntoId: mergedInto,
        deletedAt: people.deletedAt,
        deletedBy: people.deletedBy,
      });
    if (!person) throw new TrashError(NO_LONGER_IN_TRASH);
    await tx.insert(auditLogs).values({
      treeId,
      actorId,
      action: "person.purged",
      targetType: "person",
      targetId: personId,
      summary: `Permanently removed person ${person.fullName}`,
      metadata: {
        fullName: person.fullName,
        birthYear: person.birthYear,
        deathYear: person.deathYear,
        sourceId: person.sourceId,
        mergedInto: person.mergedIntoId,
        deletedAt: person.deletedAt,
        deletedBy: person.deletedBy,
      },
    });
  });
}
