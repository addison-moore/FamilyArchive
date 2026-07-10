import { once } from "node:events";
import { statfs } from "node:fs/promises";
import { Transform } from "node:stream";

import { getEnv } from "@familyarchive/config";
import {
  archiveExports,
  auditLogs,
  collectionMedia,
  collections,
  getDb,
  mediaFaces,
  mediaItems,
  mediaPeople,
  mediaTags,
  people,
  personNames,
  places,
  relationships,
  sources,
  suggestions,
  tags,
  trees,
  users,
} from "@familyarchive/db";
import { generateGedcom } from "@familyarchive/gedcom";
import {
  EMAIL_QUEUE,
  EXPORT_QUEUE,
  EXPORT_RETENTION_DAYS,
  EXPORT_SCHEMA_VERSION,
  renderBrandedEmail,
  type ArchiveExportJob,
  type EmailJob,
  type ExportCounts,
} from "@familyarchive/shared";
import { ZipArchive } from "archiver";
import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import { and, eq, inArray, isNull, lt, ne } from "drizzle-orm";
import type pino from "pino";

import { storageDriverFor } from "./storage";

const CLEANUP_QUEUE = "export-cleanup";
/** Headroom demanded beyond the estimated bundle size before assembly starts. */
const DISK_SLACK_BYTES = 256 * 1024 * 1024;

/** ZIP entry name for a media original — collision-proof and filesystem-safe. */
function mediaEntryName(mediaId: string, originalFilename: string): string {
  const safe = originalFilename.replace(/[^\w.-]+/g, "_").slice(-120) || "file";
  return `media/${mediaId}/${safe}`;
}

function readmeText(treeName: string): string {
  return [
    `FamilyArchive export of "${treeName}"`,
    "",
    "Contents:",
    "  gedcom.ged     - the family tree in standard GEDCOM 5.5.1 (importable",
    "                   into FamilyArchive and other genealogy software)",
    "  data.json      - every record in this archive (people, relationships,",
    "                   places, media details, extracted text, face tags,",
    "                   collections, sources, suggestions)",
    "  media/         - the original photo/video/audio/document files, one",
    "                   folder per item (folder name = the media id used in",
    "                   data.json; checksums are in data.json)",
    "  manifest.json  - schema version and entry counts",
    "",
    "To start a new self-hosted FamilyArchive from this bundle: install the app",
    "(https://family-archive.net/docs/self-hosting/quickstart), import",
    "gedcom.ged as a new archive, then re-upload the files in media/.",
    "Automatic bundle import is not available yet.",
  ].join("\n");
}

async function assertLocalDiskHeadroom(estimatedBytes: number): Promise<void> {
  const env = getEnv();
  if (env.MEDIA_STORAGE_DRIVER !== "local") return;
  const stats = await statfs(env.MEDIA_LOCAL_PATH);
  const available = Number(stats.bavail) * Number(stats.bsize);
  if (available < estimatedBytes + DISK_SLACK_BYTES) {
    throw new Error(
      `Not enough disk space for the export bundle (need ~${Math.ceil(
        (estimatedBytes + DISK_SLACK_BYTES) / 1024 / 1024,
      )} MB free, have ${Math.floor(available / 1024 / 1024)} MB)`,
    );
  }
}

async function runExport(job: Job<ArchiveExportJob>, logger: pino.Logger, emailQueue: Queue) {
  const { treeId, exportId } = job.data;
  const db = getDb();

  const [row] = await db.select().from(archiveExports).where(eq(archiveExports.id, exportId));
  if (!row || row.status === "complete") return;
  const [tree] = await db.select().from(trees).where(eq(trees.id, treeId));
  if (!tree) throw new Error("archive not found");
  await db
    .update(archiveExports)
    .set({ status: "running", error: null })
    .where(eq(archiveExports.id, exportId));

  const includeDeleted = row.includeDeleted;
  const peopleFilter = includeDeleted
    ? eq(people.treeId, treeId)
    : and(eq(people.treeId, treeId), isNull(people.deletedAt));
  const mediaFilter = includeDeleted
    ? eq(mediaItems.treeId, treeId)
    : and(eq(mediaItems.treeId, treeId), isNull(mediaItems.deletedAt));

  const [
    allPeople,
    allPlaces,
    allRelationships,
    allMedia,
    allTags,
    allCollections,
    allSources,
    allSuggestions,
  ] = await Promise.all([
    db.select().from(people).where(peopleFilter),
    db.select().from(places).where(eq(places.treeId, treeId)),
    db.select().from(relationships).where(eq(relationships.treeId, treeId)),
    db.select().from(mediaItems).where(mediaFilter),
    db.select().from(tags).where(eq(tags.treeId, treeId)),
    db.select().from(collections).where(eq(collections.treeId, treeId)),
    db.select().from(sources).where(eq(sources.treeId, treeId)),
    db.select().from(suggestions).where(eq(suggestions.treeId, treeId)),
  ]);

  const personIds = new Set(allPeople.map((p) => p.id));
  const mediaIds = new Set(allMedia.map((m) => m.id));
  const [allNames, allMediaPeople, allFaces, allMediaTags, allCollectionMedia] = await Promise.all([
    personIds.size
      ? db
          .select()
          .from(personNames)
          .where(inArray(personNames.personId, [...personIds]))
      : Promise.resolve([]),
    mediaIds.size
      ? db
          .select()
          .from(mediaPeople)
          .where(inArray(mediaPeople.mediaId, [...mediaIds]))
      : Promise.resolve([]),
    mediaIds.size
      ? db
          .select()
          .from(mediaFaces)
          .where(inArray(mediaFaces.mediaId, [...mediaIds]))
      : Promise.resolve([]),
    mediaIds.size
      ? db
          .select()
          .from(mediaTags)
          .where(inArray(mediaTags.mediaId, [...mediaIds]))
      : Promise.resolve([]),
    allCollections.length
      ? db
          .select()
          .from(collectionMedia)
          .where(
            inArray(
              collectionMedia.collectionId,
              allCollections.map((c) => c.id),
            ),
          )
      : Promise.resolve([]),
  ]);

  const counts: ExportCounts = {
    people: allPeople.length,
    relationships: allRelationships.length,
    places: allPlaces.length,
    media: allMedia.length,
    collections: allCollections.length,
    sources: allSources.length,
    suggestions: allSuggestions.length,
  };

  const exportedAt = new Date().toISOString();
  const manifest = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt,
    archive: { id: tree.id, name: tree.name },
    includeDeleted,
    counts,
    note: "Per-file SHA-256 checksums for media/ are the `hash` field on each media record in data.json.",
  };

  const data = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt,
    includeDeleted,
    tree: { id: tree.id, name: tree.name, description: tree.description, metadata: tree.metadata },
    people: allPeople,
    personNames: allNames,
    relationships: allRelationships.filter(
      (r) => personIds.has(r.fromPersonId) && personIds.has(r.toPersonId),
    ),
    places: allPlaces,
    media: allMedia.map((m) => ({ ...m, bundlePath: mediaEntryName(m.id, m.originalFilename) })),
    mediaPeople: allMediaPeople,
    mediaFaces: allFaces,
    tags: allTags,
    mediaTags: allMediaTags,
    collections: allCollections,
    collectionMedia: allCollectionMedia,
    sources: allSources,
    suggestions: allSuggestions,
  };

  const gedcom = await generateGedcom(treeId);
  const estimatedBytes = allMedia.reduce((sum, m) => sum + (m.fileSize ?? 0), 0);
  await assertLocalDiskHeadroom(estimatedBytes);

  // Stream the ZIP straight into storage; count bytes on the way through.
  const env = getEnv();
  const targetDriver = storageDriverFor(env.MEDIA_STORAGE_DRIVER);
  let bundleBytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, callback) {
      bundleBytes += chunk.length;
      callback(null, chunk);
    },
  });
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const archiveFailed = new Promise<never>((_, reject) => {
    archive.on("error", (error) => reject(error));
  });
  archive.pipe(counter);
  const putPromise = targetDriver.putStream(row.storageKey, counter, { overwrite: true });
  // Both promises are awaited via race() below; pre-register handlers so an
  // early rejection can't surface as an unhandled rejection in the meantime.
  archiveFailed.catch(() => {});
  putPromise.catch(() => {});

  archive.append(readmeText(tree.name), { name: "README.txt" });
  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
  archive.append(JSON.stringify(data, null, 2), { name: "data.json" });
  if (gedcom) archive.append(gedcom.content, { name: "gedcom.ged" });

  // Originals one at a time (waiting for archiver's "entry" event) so we never
  // hold more than one source stream open. Media is already compressed — store.
  let done = 0;
  for (const media of allMedia) {
    const source = storageDriverFor(media.storageDriver === "s3" ? "s3" : "local");
    const object = await source.getStream(media.storageKey);
    const finished = once(archive, "entry");
    archive.append(object.stream, {
      name: mediaEntryName(media.id, media.originalFilename),
      store: true,
    });
    await Promise.race([finished, archiveFailed]);
    done += 1;
    await job.updateProgress(Math.round((done / Math.max(allMedia.length, 1)) * 90));
  }

  await archive.finalize();
  await Promise.race([putPromise, archiveFailed]);

  // The new bundle replaces any previous one for this archive.
  const stale = await db
    .select()
    .from(archiveExports)
    .where(and(eq(archiveExports.treeId, treeId), ne(archiveExports.id, exportId)));
  for (const old of stale) {
    await storageDriverFor(old.storageDriver === "s3" ? "s3" : "local")
      .delete(old.storageKey)
      .catch(() => {});
    await db.delete(archiveExports).where(eq(archiveExports.id, old.id));
  }

  const completedAt = new Date();
  const expiresAt = new Date(completedAt.getTime() + EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db
    .update(archiveExports)
    .set({ status: "complete", fileSize: bundleBytes, counts, completedAt, expiresAt })
    .where(eq(archiveExports.id, exportId));
  await db.insert(auditLogs).values({
    treeId,
    actorId: row.requestedBy,
    action: "archive.exported",
    targetType: "tree",
    targetId: treeId,
    summary: `Archive export completed (${counts.people} people, ${counts.media} media, ${Math.round(bundleBytes / 1024 / 1024)} MB)`,
  });
  logger.info({ treeId, exportId, bundleBytes, counts }, "archive export complete");

  // Tell the requester (silent no-op without SMTP, matching the web app).
  if (env.SMTP_HOST && row.requestedBy) {
    const [requester] = await db.select().from(users).where(eq(users.id, row.requestedBy));
    if (requester?.email) {
      const url = `${env.APP_URL}/trees/${treeId}/settings`;
      const emailJob: EmailJob = {
        to: requester.email,
        subject: `Your export of "${tree.name}" is ready`,
        text: `The archive export you requested is ready to download from the archive settings page: ${url}\n\nThe download stays available for ${EXPORT_RETENTION_DAYS} days.`,
        html: renderBrandedEmail({
          heading: `Your export of "${tree.name}" is ready`,
          bodyLines: [
            "The complete archive bundle you requested — family tree, original photos and documents, and all details — is ready to download.",
            `The download stays available for ${EXPORT_RETENTION_DAYS} days.`,
          ],
          cta: { label: "Download the export", url },
        }),
      };
      await emailQueue.add("send", emailJob);
    }
  }
}

/** Remove expired bundles and mark exports that died mid-run. */
async function cleanupExports(logger: pino.Logger): Promise<void> {
  const db = getDb();
  const expired = await db
    .select()
    .from(archiveExports)
    .where(and(eq(archiveExports.status, "complete"), lt(archiveExports.expiresAt, new Date())));
  for (const row of expired) {
    await storageDriverFor(row.storageDriver === "s3" ? "s3" : "local")
      .delete(row.storageKey)
      .catch(() => {});
    await db.delete(archiveExports).where(eq(archiveExports.id, row.id));
  }
  if (expired.length > 0)
    logger.info({ removed: expired.length }, "expired export bundles removed");

  const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db
    .update(archiveExports)
    .set({ status: "failed", error: "Export did not finish — request it again" })
    .where(and(eq(archiveExports.status, "running"), lt(archiveExports.createdAt, staleCutoff)));
}

export function startExportWorker(connection: ConnectionOptions, logger: pino.Logger): Worker[] {
  const emailQueue = new Queue(EMAIL_QUEUE, { connection });

  const exportWorker = new Worker<ArchiveExportJob>(
    EXPORT_QUEUE,
    (job) => runExport(job, logger, emailQueue),
    { connection },
  );
  exportWorker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, err: error }, "archive export failed");
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    void getDb()
      .update(archiveExports)
      .set({ status: "failed", error: error.message.slice(0, 500) })
      .where(eq(archiveExports.id, job.data.exportId));
  });

  const cleanupQueue = new Queue(CLEANUP_QUEUE, { connection });
  const cleanupWorker = new Worker(CLEANUP_QUEUE, () => cleanupExports(logger), { connection });
  cleanupWorker.on("failed", (_job, error) =>
    logger.error({ err: error }, "export cleanup failed"),
  );
  void (async () => {
    await cleanupExports(logger).catch((error) =>
      logger.error({ err: error }, "startup export cleanup failed"),
    );
    await cleanupQueue.upsertJobScheduler("export-cleanup-daily", {
      every: 24 * 60 * 60 * 1000,
    });
  })();

  return [exportWorker, cleanupWorker];
}
