import { getEnv } from "@familyarchive/config";
import { auditLogs, getDb } from "@familyarchive/db";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { lt, sql } from "drizzle-orm";
import type pino from "pino";

const QUEUE = "audit-cleanup";

/** Delete audit entries past the configured retention (PRD §22.3). */
async function cleanup(logger: pino.Logger): Promise<void> {
  const days = getEnv().AUDIT_RETENTION_DAYS;
  if (days <= 0) return; // default: keep forever
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const deleted = await getDb()
    .delete(auditLogs)
    .where(lt(auditLogs.createdAt, cutoff))
    .returning({ id: sql`1` });
  if (deleted.length > 0) {
    logger.info({ deleted: deleted.length, days }, "audit retention cleanup");
  }
}

/** Runs at worker startup and daily thereafter. */
export function startAuditCleanup(connection: ConnectionOptions, logger: pino.Logger): Worker {
  const queue = new Queue(QUEUE, { connection });
  const worker = new Worker(QUEUE, () => cleanup(logger), { connection });
  worker.on("failed", (_job, error) => logger.error({ err: error }, "audit cleanup failed"));

  void (async () => {
    await cleanup(logger).catch((error) =>
      logger.error({ err: error }, "startup audit cleanup failed"),
    );
    await queue.upsertJobScheduler("audit-cleanup-daily", { every: 24 * 60 * 60 * 1000 });
  })();

  return worker;
}
