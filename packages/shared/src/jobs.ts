/** Queue names and job payloads shared between the web app and the worker. */

export const HEARTBEAT_QUEUE = "heartbeat";

/** Outbound email jobs (PRD §26.4 "Email send"). */
export const EMAIL_QUEUE = "email";

export interface EmailJob {
  to: string;
  subject: string;
  text: string;
}

/** Parse a redis:// URL into BullMQ connection options (BullMQ bundles its own ioredis). */
export function redisConnectionOptions(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || "6379"),
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number(url.pathname.slice(1) || "0"),
    maxRetriesPerRequest: null,
  };
}
