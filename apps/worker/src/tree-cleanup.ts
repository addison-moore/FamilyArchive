import { recomputeInstanceUsage } from "@familyarchive/db";
import { treePrefix } from "@familyarchive/media";
import { TREE_CLEANUP_QUEUE, type TreeCleanupJob } from "@familyarchive/shared";
import { Worker, type ConnectionOptions, type Job } from "bullmq";
import type pino from "pino";

import { storageDriverFor } from "./storage";

/**
 * Sweep an archive's stored blobs after the archive has been deleted.
 *
 * Deleting a tree row cascades away its media, derivative and export rows, and
 * with them the only record of every storage key — so nothing row-driven can
 * ever reach those objects again. Without this sweep the bytes stayed on disk
 * (or in the bucket) forever while the nightly usage recompute reported the
 * space as free, letting the quota drift arbitrarily far from reality.
 */
export function startTreeCleanupWorker(connection: ConnectionOptions, logger: pino.Logger): Worker {
  const worker = new Worker<TreeCleanupJob>(
    TREE_CLEANUP_QUEUE,
    async (job: Job<TreeCleanupJob>) => {
      const { treeId, storageDriver } = job.data;
      const prefix = treePrefix(treeId);
      await storageDriverFor(storageDriver).deletePrefix(prefix);
      // The counter is derived from surviving rows, so it has to be recomputed
      // after the bytes are actually gone, not when the rows disappeared.
      await recomputeInstanceUsage();
      logger.info({ treeId, prefix }, "archive storage swept");
    },
    { connection },
  );
  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, treeId: job?.data?.treeId, err: error }, "tree cleanup failed");
  });
  return worker;
}
