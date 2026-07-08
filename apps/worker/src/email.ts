import { getEnv } from "@familyarchive/config";
import { EMAIL_QUEUE, type EmailJob } from "@familyarchive/shared";
import { Worker, type ConnectionOptions } from "bullmq";
import nodemailer from "nodemailer";
import type pino from "pino";

/**
 * Email send jobs (PRD §26.4). The web app only enqueues when SMTP is configured
 * (PRD §9.3 — invite links still work without it); if a job arrives anyway, it
 * fails with a clear error and BullMQ's retry/backoff applies.
 */
export function startEmailWorker(connection: ConnectionOptions, logger: pino.Logger): Worker {
  const env = getEnv();

  const transport = env.SMTP_HOST
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 587,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      })
    : null;

  const worker = new Worker<EmailJob>(
    EMAIL_QUEUE,
    async (job) => {
      if (!transport || !env.SMTP_FROM) {
        throw new Error("SMTP is not configured (SMTP_HOST / SMTP_FROM)");
      }
      await transport.sendMail({
        from: env.SMTP_FROM,
        to: job.data.to,
        subject: job.data.subject,
        text: job.data.text,
        html: job.data.html,
      });
      logger.info({ jobId: job.id, to: job.data.to }, "email sent");
    },
    { connection },
  );

  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, err: error }, "email job failed");
  });

  return worker;
}
