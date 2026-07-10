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

/**
 * FamilyArchive job worker. Current consumers: heartbeat (M1 plumbing check) and
 * email send (M2 invites). Media processing, OCR, face detection, and GEDCOM jobs
 * land in Milestones 5–9 (PRD §26.4).
 */

const logger = pino({ name: "familyarchive-worker" });
const env = getEnv();
const connection = redisConnectionOptions(env.REDIS_URL);

const heartbeatQueue = new Queue(HEARTBEAT_QUEUE, { connection });

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

async function main() {
  await heartbeatQueue.upsertJobScheduler("heartbeat-every-minute", { every: 60_000 });
  logger.info(
    { queues: [HEARTBEAT_QUEUE, "email", "media", "ocr", "ai", "faces"] },
    "worker started",
  );
}

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  await Promise.all([
    heartbeatWorker.close(),
    emailWorker.close(),
    mediaWorker.close(),
    ...textWorkers.map((w) => w.close()),
    facesWorker.close(),
    auditWorker.close(),
    ...exportWorkers.map((w) => w.close()),
    heartbeatQueue.close(),
  ]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

main().catch((error) => {
  logger.error({ err: error }, "worker failed to start");
  process.exit(1);
});
