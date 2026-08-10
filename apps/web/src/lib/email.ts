import { getEnv } from "@familyarchive/config";
import {
  EMAIL_JOB_OPTIONS,
  EMAIL_QUEUE,
  redisConnectionOptions,
  type EmailJob,
} from "@familyarchive/shared";
import { Queue } from "bullmq";

let queue: Queue<EmailJob> | undefined;

function getEmailQueue(): Queue<EmailJob> {
  if (!queue) {
    queue = new Queue<EmailJob>(EMAIL_QUEUE, {
      connection: redisConnectionOptions(getEnv().REDIS_URL),
      defaultJobOptions: EMAIL_JOB_OPTIONS,
    });
  }
  return queue;
}

/** Invite links must still work without SMTP — callers branch on this. */
export { smtpConfigured } from "@familyarchive/config";

export async function enqueueEmail(job: EmailJob): Promise<void> {
  await getEmailQueue().add("send", job);
}
