import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

import { getDb, mediaFaces, mediaItems } from "@familyarchive/db";
import {
  FACES_QUEUE,
  isFaceDetectionEligible,
  type FaceDetectJob,
  type TextJobStatus,
} from "@familyarchive/shared";
import { Worker, type ConnectionOptions, type Job } from "bullmq";
import { and, eq, isNull } from "drizzle-orm";
import sharp from "sharp";
import type pino from "pino";

import { storageDriverFor } from "./storage";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(new URL("../scripts/detect_faces.py", import.meta.url));
const DETECTION_VERSION = "mediapipe-blazeface-0.10";

interface DetectedBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number | null;
}

async function setFacesState(
  mediaId: string,
  state: { status: TextJobStatus; error?: string | null; count?: number },
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ metadata: mediaItems.metadata })
    .from(mediaItems)
    .where(eq(mediaItems.id, mediaId))
    .limit(1);
  const metadata = { ...(rows[0]?.metadata as Record<string, unknown>) };
  metadata.faces = {
    ...(metadata.faces as Record<string, unknown> | undefined),
    ...state,
    updatedAt: new Date().toISOString(),
  };
  await db
    .update(mediaItems)
    .set({ metadata, updatedAt: new Date() })
    .where(eq(mediaItems.id, mediaId));
}

/**
 * Face detection job (PRD §17): normalize the image with sharp, run the
 * MediaPipe Python script, and replace unassigned auto-detected boxes.
 * Person-assigned and manual boxes always survive a re-run.
 */
async function detectFaces(job: Job<FaceDetectJob>, logger: pino.Logger): Promise<void> {
  const { mediaId, treeId } = job.data;
  const db = getDb();
  const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaId)).limit(1);
  const media = rows[0];
  if (!media || media.treeId !== treeId || media.deletedAt || !media.storageKey) {
    logger.warn({ mediaId }, "faces: media missing or deleted — skipping");
    return;
  }
  if (!isFaceDetectionEligible(media.mediaType, media.mimeType)) {
    logger.info({ mediaId, mediaType: media.mediaType }, "faces: not eligible");
    return;
  }

  await setFacesState(mediaId, { status: "running", error: null });
  const driver = storageDriverFor(media.storageDriver === "s3" ? "s3" : "local");
  const workDir = await mkdtemp(path.join(os.tmpdir(), "familyarchive-faces-"));

  try {
    const sourcePath = path.join(workDir, "original");
    const object = await driver.getStream(media.storageKey);
    await pipeline(object.stream, createWriteStream(sourcePath));

    // Normalized PNG input: EXIF-rotated, bounded size; coordinates stay
    // valid for the original because they are relative (§17.5).
    const detectPath = path.join(workDir, "detect.png");
    await sharp(sourcePath, { failOn: "error" })
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .png()
      .toFile(detectPath);

    const { stdout } = await execFileAsync("python3", [SCRIPT_PATH, detectPath], {
      maxBuffer: 8 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    });
    const boxes = JSON.parse(stdout) as DetectedBox[];

    // Intersection-over-union — used to avoid re-adding a detection on top of a
    // box that survived the re-run (assigned or manually drawn).
    const iou = (a: DetectedBox, b: { x: number; y: number; width: number; height: number }) => {
      const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      const inter = ix * iy;
      const union = a.width * a.height + b.width * b.height - inter;
      return union > 0 ? inter / union : 0;
    };

    await db.transaction(async (tx) => {
      await tx
        .delete(mediaFaces)
        .where(
          and(
            eq(mediaFaces.mediaId, mediaId),
            eq(mediaFaces.detectedBy, "mediapipe"),
            isNull(mediaFaces.personId),
          ),
        );
      const surviving = await tx
        .select({
          x: mediaFaces.x,
          y: mediaFaces.y,
          width: mediaFaces.width,
          height: mediaFaces.height,
        })
        .from(mediaFaces)
        .where(eq(mediaFaces.mediaId, mediaId));
      const fresh = boxes.filter((box) => !surviving.some((kept) => iou(box, kept) > 0.4));
      if (fresh.length > 0) {
        await tx.insert(mediaFaces).values(
          fresh.map((box) => ({
            mediaId,
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            confidence: box.confidence,
            detectedBy: "mediapipe",
            detectionVersion: DETECTION_VERSION,
          })),
        );
      }
    });

    await setFacesState(mediaId, { status: "done", error: null, count: boxes.length });
    logger.info({ mediaId, faces: boxes.length }, "face detection complete");
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export function startFacesWorker(connection: ConnectionOptions, logger: pino.Logger): Worker {
  const worker = new Worker<FaceDetectJob>(FACES_QUEUE, (job) => detectFaces(job, logger), {
    connection,
  });
  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, err: error }, "faces job failed");
    if (!job) return;
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    void setFacesState(job.data.mediaId, {
      status: exhausted ? "failed" : "queued",
      error: error.message,
    }).catch(() => {});
  });
  return worker;
}
