import { getEnv } from "@familyarchive/config";
import {
  AI_QUEUE,
  EMAIL_JOB_OPTIONS,
  EMAIL_QUEUE,
  EXPORT_QUEUE,
  FACES_QUEUE,
  MEDIA_QUEUE,
  OCR_QUEUE,
  redisConnectionOptions,
  TREE_CLEANUP_QUEUE,
  type AiCleanupJob,
  type ArchiveExportJob,
  type EmailJob,
  type FaceDetectJob,
  type MediaProcessJob,
  type OcrJob,
  type TreeCleanupJob,
} from "@familyarchive/shared";
import { Queue } from "bullmq";

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: 200,
  removeOnFail: 500,
};

/** How long a request waits on Valkey before reporting the failure. */
const ENQUEUE_TIMEOUT_MS = 5_000;

const queues = new Map<string, Queue>();

function getQueue<T>(name: string, defaultJobOptions: object = DEFAULT_JOB_OPTIONS): Queue<T> {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      // The offline queue suits the worker, which can sit and wait for Valkey. A
      // web request cannot: with it on, every action that enqueues would hang for
      // as long as Valkey stayed down rather than failing where the user can see.
      connection: { ...redisConnectionOptions(getEnv().REDIS_URL), enableOfflineQueue: false },
      defaultJobOptions,
    });
    queues.set(name, queue);
  }
  return queue as Queue<T>;
}

/** Covers the first connection too, which waits for Valkey however the queue is set up. */
async function withinTimeout(pending: Promise<unknown>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Timed out waiting for Valkey")), ENQUEUE_TIMEOUT_MS);
  });
  await Promise.race([pending, timeout]).finally(() => clearTimeout(timer));
}

/** Kick off processing for an uploaded/reprocessed media item. */
export async function enqueueMediaProcessing(treeId: string, mediaId: string): Promise<void> {
  await withinTimeout(getQueue<MediaProcessJob>(MEDIA_QUEUE).add("process", { treeId, mediaId }));
}

export async function enqueueOcr(treeId: string, mediaId: string): Promise<void> {
  await withinTimeout(getQueue<OcrJob>(OCR_QUEUE).add("ocr", { treeId, mediaId }));
}

export async function enqueueAiCleanup(treeId: string, mediaId: string): Promise<void> {
  await withinTimeout(getQueue<AiCleanupJob>(AI_QUEUE).add("cleanup", { treeId, mediaId }));
}

export async function enqueueFaceDetection(treeId: string, mediaId: string): Promise<void> {
  await withinTimeout(getQueue<FaceDetectJob>(FACES_QUEUE).add("detect", { treeId, mediaId }));
}

export async function enqueueArchiveExport(job: ArchiveExportJob): Promise<void> {
  await withinTimeout(getQueue<ArchiveExportJob>(EXPORT_QUEUE).add("export", job));
}

/** Sweep an archive's stored blobs after its rows have been deleted. */
export async function enqueueTreeCleanup(job: TreeCleanupJob): Promise<void> {
  await withinTimeout(getQueue<TreeCleanupJob>(TREE_CLEANUP_QUEUE).add("cleanup", job));
}

export async function enqueueEmail(job: EmailJob): Promise<void> {
  await withinTimeout(getQueue<EmailJob>(EMAIL_QUEUE, EMAIL_JOB_OPTIONS).add("send", job));
}

/** AI features render only when the admin configured a provider. */
export function aiConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.AI_PROVIDER && env.AI_API_KEY);
}
