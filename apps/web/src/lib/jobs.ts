import { getEnv } from "@familyarchive/config";
import { MEDIA_QUEUE, redisConnectionOptions, type MediaProcessJob } from "@familyarchive/shared";
import { Queue } from "bullmq";

let queue: Queue<MediaProcessJob> | undefined;

function getMediaQueue(): Queue<MediaProcessJob> {
  if (!queue) {
    queue = new Queue<MediaProcessJob>(MEDIA_QUEUE, {
      connection: redisConnectionOptions(getEnv().REDIS_URL),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    });
  }
  return queue;
}

/** Kick off processing for an uploaded/reprocessed media item (PRD §15.5, §26.4). */
export async function enqueueMediaProcessing(treeId: string, mediaId: string): Promise<void> {
  await getMediaQueue().add("process", { treeId, mediaId });
}
