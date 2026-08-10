import { getEnv } from "@familyarchive/config";
import { HEARTBEAT_QUEUE, redisConnectionOptions } from "@familyarchive/shared";
import { Queue, Worker } from "bullmq";
import pino from "pino";

import { startAuditCleanup } from "./audit-cleanup";
import { startEmailWorker } from "./email";
import { startExportWorker } from "./export";
import { startFacesWorker } from "./faces";
import { startMediaWorker } from "./media";
import { startTextWorkers } from "./text-jobs";
import { startTreeCleanupWorker } from "./tree-cleanup";
import { startUsageReconcile } from "./usage";

/**
 * FamilyArchive job worker: heartbeat (plumbing check), email delivery, media
 * processing, OCR/AI text jobs, and face detection.
 */

const logger = pino({ name: "familyarchive-worker" });
const env = getEnv();
const connection = redisConnectionOptions(env.REDIS_URL);

const heartbeatQueue = new Queue(HEARTBEAT_QUEUE, {
  connection,
  // One job a minute forever: without these caps Valkey retains roughly 525k
  // completed heartbeat records a year, none of which anything reads.
  defaultJobOptions: { removeOnComplete: 10, removeOnFail: 50 },
});

const heartbeatWorker = new Worker(
  HEARTBEAT_QUEUE,
  async (job) => {
    logger.info({ jobId: job.id }, "heartbeat");
  },
  { connection },
);

heartbeatWorker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, err: error }, "job failed");
});

const emailWorker = startEmailWorker(connection, logger);
const mediaWorker = startMediaWorker(connection, logger);
const textWorkers = startTextWorkers(connection, logger);
const facesWorker = startFacesWorker(connection, logger);
const auditWorker = startAuditCleanup(connection, logger);
const exportWorkers = startExportWorker(connection, logger);
const usageWorker = startUsageReconcile(connection, logger);
const treeCleanupWorker = startTreeCleanupWorker(connection, logger);

const workers = [
  heartbeatWorker,
  emailWorker,
  mediaWorker,
  ...textWorkers,
  facesWorker,
  auditWorker,
  ...exportWorkers,
  usageWorker,
  treeCleanupWorker,
];

async function main() {
  await heartbeatQueue.upsertJobScheduler("heartbeat-every-minute", { every: 60_000 });
  logger.info({ queues: workers.map((w) => w.name) }, "worker started");
}

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");
  await Promise.all([...workers.map((w) => w.close()), heartbeatQueue.close()]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// A rejection with no handler would otherwise terminate the process silently on
// current Node, dropping any job still in flight without a failure record.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandled rejection");
});
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "uncaught exception — shutting down");
  void shutdown("uncaughtException");
});

main().catch((error) => {
  logger.error({ err: error }, "worker failed to start");
  process.exit(1);
});
