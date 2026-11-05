import { getDb, getInstanceUsage, mediaItems, recomputeInstanceUsage } from "@familyarchive/db";
import { uploadTempKey } from "@familyarchive/media";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { and, isNull, lt } from "drizzle-orm";
import type pino from "pino";

import { runDaily } from "./scheduling";
import { storageDriverFor } from "./storage";

const QUEUE = "usage-reconcile";

/** Far longer than any upload takes, so a live one is never mistaken for abandoned. */
const ABANDONED_UPLOAD_MS = 24 * 60 * 60 * 1000;

/**
 * Remove uploads that never finished. The route inserts a placeholder row before
 * reading the body and cleans up after any failure it sees, but a process that dies
 * mid-upload sees nothing: the row stays in the library as "Preparing…" with no file
 * behind it, and the temp file stays on disk.
 */
async function sweepAbandonedUploads(logger: pino.Logger): Promise<void> {
  const cutoff = new Date(Date.now() - ABANDONED_UPLOAD_MS);
  const abandoned = await getDb()
    .delete(mediaItems)
    .where(and(isNull(mediaItems.hash), lt(mediaItems.createdAt, cutoff)))
    .returning({
      id: mediaItems.id,
      treeId: mediaItems.treeId,
      storageDriver: mediaItems.storageDriver,
    });
  for (const upload of abandoned) {
    await storageDriverFor(upload.storageDriver === "s3" ? "s3" : "local")
      .delete(uploadTempKey(upload.treeId, upload.id))
      .catch(() => {});
  }
  if (abandoned.length > 0) logger.info({ removed: abandoned.length }, "abandoned uploads removed");
}

/**
 * Nightly upkeep for the instance storage counter (storage-quota plan): clear
 * abandoned uploads, recompute from media_items + media_derivatives, and log any
 * discrepancy against the maintained counter.
 */
async function reconcile(logger: pino.Logger): Promise<void> {
  await sweepAbandonedUploads(logger);
  const before = await getInstanceUsage();
  const after = await recomputeInstanceUsage();
  const drift =
    after.originalBytes + after.derivativeBytes - (before.originalBytes + before.derivativeBytes);
  if (drift !== 0) {
    logger.warn({ drift, before, after }, "instance usage counter drift corrected");
  }
}

export function startUsageReconcile(connection: ConnectionOptions, logger: pino.Logger): Worker {
  const queue = new Queue(QUEUE, { connection });
  const worker = new Worker(QUEUE, () => reconcile(logger), { connection });
  worker.on("failed", (_job, error) => logger.error({ err: error }, "usage reconcile failed"));
  runDaily(queue, "usage-reconcile-daily", "usage reconcile", () => reconcile(logger), logger);
  return worker;
}
