import { getEnv } from "@familyarchive/config";
import {
  AI_QUEUE,
  EXPORT_QUEUE,
  FACES_QUEUE,
  MEDIA_QUEUE,
  OCR_QUEUE,
  redisConnectionOptions,
  type AiCleanupJob,
  type ArchiveExportJob,
  type FaceDetectJob,
  type MediaProcessJob,
  type OcrJob,
} from "@familyarchive/shared";
import { Queue } from "bullmq";

const queues = new Map<string, Queue>();

function getQueue<T>(name: string): Queue<T> {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: redisConnectionOptions(getEnv().REDIS_URL),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    });
    queues.set(name, queue);
  }
  return queue as Queue<T>;
}

/** Kick off processing for an uploaded/reprocessed media item (PRD §15.5, §26.4). */
export async function enqueueMediaProcessing(treeId: string, mediaId: string): Promise<void> {
  await getQueue<MediaProcessJob>(MEDIA_QUEUE).add("process", { treeId, mediaId });
}

export async function enqueueOcr(treeId: string, mediaId: string): Promise<void> {
  await getQueue<OcrJob>(OCR_QUEUE).add("ocr", { treeId, mediaId });
}

export async function enqueueAiCleanup(treeId: string, mediaId: string): Promise<void> {
  await getQueue<AiCleanupJob>(AI_QUEUE).add("cleanup", { treeId, mediaId });
}

export async function enqueueFaceDetection(treeId: string, mediaId: string): Promise<void> {
  await getQueue<FaceDetectJob>(FACES_QUEUE).add("detect", { treeId, mediaId });
}

export async function enqueueArchiveExport(job: ArchiveExportJob): Promise<void> {
  await getQueue<ArchiveExportJob>(EXPORT_QUEUE).add("export", job);
}

/** AI features render only when the admin configured a provider (PRD §31.4). */
export function aiConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.AI_PROVIDER && env.AI_API_KEY);
}
