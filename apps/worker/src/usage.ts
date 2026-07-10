import { getInstanceUsage, recomputeInstanceUsage } from "@familyarchive/db";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import type pino from "pino";

const QUEUE = "usage-reconcile";

/**
 * Nightly drift correction for the instance storage counter (storage-quota
 * plan): recompute from media_items + media_derivatives and log any
 * discrepancy against the maintained counter.
 */
async function reconcile(logger: pino.Logger): Promise<void> {
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
  void (async () => {
    await reconcile(logger).catch((error) =>
      logger.error({ err: error }, "startup usage reconcile failed"),
    );
    await queue.upsertJobScheduler("usage-reconcile-daily", { every: 24 * 60 * 60 * 1000 });
  })();
  return worker;
}
