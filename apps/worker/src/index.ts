import { getEnv } from "@familyarchive/config";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import pino from "pino";

/**
 * FamilyArchive job worker.
 *
 * Milestone 1 scope (approved pull-forward from M7): connect to Valkey and process
 * a repeating no-op heartbeat job to prove the queue plumbing end-to-end. Real job
 * types — media processing, OCR, face detection, GEDCOM, email — land in
 * Milestones 5–9 (PRD §26.4).
 */

const logger = pino({ name: "familyarchive-worker" });
const env = getEnv();

const HEARTBEAT_QUEUE = "heartbeat";

const redisUrl = new URL(env.REDIS_URL);
const connection: ConnectionOptions = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || "6379"),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  db: Number(redisUrl.pathname.slice(1) || "0"),
  maxRetriesPerRequest: null,
};

const queue = new Queue(HEARTBEAT_QUEUE, { connection });

const worker = new Worker(
  HEARTBEAT_QUEUE,
  async (job) => {
    logger.info({ jobId: job.id }, "heartbeat");
  },
  { connection },
);

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, err: error }, "job failed");
});

async function main() {
  await queue.upsertJobScheduler("heartbeat-every-minute", { every: 60_000 });
  logger.info({ queue: HEARTBEAT_QUEUE }, "worker started");
}

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  await worker.close();
  await queue.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

main().catch((error) => {
  logger.error({ err: error }, "worker failed to start");
  process.exit(1);
});
