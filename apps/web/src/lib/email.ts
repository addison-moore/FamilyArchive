import { getEnv } from "@familyarchive/config";
import { EMAIL_QUEUE, redisConnectionOptions, type EmailJob } from "@familyarchive/shared";
import { Queue } from "bullmq";

let queue: Queue<EmailJob> | undefined;

function getEmailQueue(): Queue<EmailJob> {
  if (!queue) {
    queue = new Queue<EmailJob>(EMAIL_QUEUE, {
      connection: redisConnectionOptions(getEnv().REDIS_URL),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return queue;
}

/** Invite links must still work without SMTP (PRD §9.3) — callers branch on this. */
export function smtpConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}

export async function enqueueEmail(job: EmailJob): Promise<void> {
  await getEmailQueue().add("send", job);
}
