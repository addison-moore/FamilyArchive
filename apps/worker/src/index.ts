import { getEnv } from "@familyarchive/config";
import { redisConnectionOptions } from "@familyarchive/shared";
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
 * FamilyArchive job worker: email delivery, media processing, OCR/AI text jobs,
 * face detection, exports, and the daily maintenance tasks.
 */

const logger = pino({ name: "familyarchive-worker" });
const env = getEnv();
const connection = redisConnectionOptions(env.REDIS_URL);

const emailWorker = startEmailWorker(connection, logger);
const mediaWorker = startMediaWorker(connection, logger);
const textWorkers = startTextWorkers(connection, logger);
const facesWorker = startFacesWorker(connection, logger);
const auditWorker = startAuditCleanup(connection, logger);
const exportWorkers = startExportWorker(connection, logger);
const usageWorker = startUsageReconcile(connection, logger);
const treeCleanupWorker = startTreeCleanupWorker(connection, logger);

const workers = [
  emailWorker,
  mediaWorker,
  ...textWorkers,
  facesWorker,
  auditWorker,
  ...exportWorkers,
  usageWorker,
  treeCleanupWorker,
];

logger.info({ queues: workers.map((w) => w.name) }, "worker started");

let shuttingDown = false;

async function shutdown(signal: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(exitCode);
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
  // Non-zero so a crash reads as a crash to anything watching the exit status.
  void shutdown("uncaughtException", 1);
});
