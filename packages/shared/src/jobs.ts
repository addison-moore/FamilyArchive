/** Queue names and job payloads shared between the web app and the worker. */

/** Outbound email jobs. */
export const EMAIL_QUEUE = "email";

export interface EmailJob {
  to: string;
  subject: string;
  /** Plain-text body — always present as the fallback. */
  text: string;
  /** Branded HTML body (see email-template.ts). */
  html?: string;
}

/**
 * Shared by both producers on the email queue (the web app and the export
 * worker). BullMQ defaults `attempts` to 0, which makes the first delivery
 * failure terminal, and retains completed jobs forever — the worker's queue was
 * created with no options at all, so its notifications silently got neither
 * retries nor cleanup while the web app's got both.
 */
export const EMAIL_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

/**
 * Storage sweep for a deleted archive. Deleting the tree row cascades away every
 * media/derivative/export row, and with them the only record of each storage
 * key — so the blobs have to be swept by prefix instead, out of band.
 */
export const TREE_CLEANUP_QUEUE = "tree-cleanup";

export interface TreeCleanupJob {
  treeId: string;
  storageDriver: "local" | "s3";
}

/**
 * Parse a redis:// or rediss:// URL into BullMQ connection options (BullMQ
 * bundles its own ioredis). `URL` leaves credentials percent-encoded, so a
 * password with a reserved character has to be decoded or it never matches.
 */
export function redisConnectionOptions(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || "6379"),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number(url.pathname.slice(1) || "0"),
    maxRetriesPerRequest: null,
    // Without this a rediss:// URL silently spoke plaintext.
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}
