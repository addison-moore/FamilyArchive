import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

import { getDb, mediaDerivatives, mediaItems } from "@familyarchive/db";
import { derivativeKey } from "@familyarchive/media";
import {
  MAX_PDF_PREVIEW_PAGES,
  MEDIA_QUEUE,
  THUMB_SIZE,
  type MediaProcessJob,
  type ProcessingStatus,
} from "@familyarchive/shared";
import { Worker, type ConnectionOptions, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import type pino from "pino";

import { storageDriverFor } from "./storage";

const execFileAsync = promisify(execFile);

interface DerivativeOutput {
  kind: "thumb" | "pdf_page" | "video_thumb";
  page: number;
  fileName: string;
  localPath: string;
  width?: number;
  height?: number;
}

async function makeThumb(sourcePath: string, outPath: string): Promise<DerivativeOutput> {
  const result = await sharp(sourcePath, { failOn: "error" })
    .rotate() // respect EXIF orientation
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(outPath);
  return {
    kind: "thumb",
    page: 0,
    fileName: "thumb_512.webp",
    localPath: outPath,
    width: result.width,
    height: result.height,
  };
}

async function processImage(sourcePath: string, workDir: string): Promise<DerivativeOutput[]> {
  return [await makeThumb(sourcePath, path.join(workDir, "thumb_512.webp"))];
}

async function processVideo(sourcePath: string, workDir: string): Promise<DerivativeOutput[]> {
  const framePath = path.join(workDir, "frame.png");
  // Grab a frame ~1s in (falls back to the first frame on very short clips).
  await execFileAsync("ffmpeg", [
    "-y",
    "-ss",
    "1",
    "-i",
    sourcePath,
    "-frames:v",
    "1",
    framePath,
  ]).catch(async () => {
    await execFileAsync("ffmpeg", ["-y", "-i", sourcePath, "-frames:v", "1", framePath]);
  });

  const videoThumbPath = path.join(workDir, "video_thumb.webp");
  const full = await sharp(framePath).webp({ quality: 80 }).toFile(videoThumbPath);
  const thumb = await makeThumb(framePath, path.join(workDir, "thumb_512.webp"));
  return [
    {
      kind: "video_thumb",
      page: 0,
      fileName: "video_thumb.webp",
      localPath: videoThumbPath,
      width: full.width,
      height: full.height,
    },
    thumb,
  ];
}

async function processPdf(
  sourcePath: string,
  workDir: string,
  job: Job<MediaProcessJob>,
): Promise<DerivativeOutput[]> {
  // pdftoppm writes page-NNN.png files; -r 110 keeps previews readable but light.
  await execFileAsync("pdftoppm", [
    "-png",
    "-r",
    "110",
    "-l",
    String(MAX_PDF_PREVIEW_PAGES),
    sourcePath,
    path.join(workDir, "page"),
  ]);
  const pageFiles = (await readdir(workDir)).filter((name) => /^page-\d+\.png$/.test(name)).sort();
  if (pageFiles.length === 0) throw new Error("PDF produced no page previews");

  const outputs: DerivativeOutput[] = [];
  for (const [index, name] of pageFiles.entries()) {
    const page = index + 1;
    const fileName = `pdf_page_${String(page).padStart(3, "0")}.webp`;
    const outPath = path.join(workDir, fileName);
    const result = await sharp(path.join(workDir, name)).webp({ quality: 78 }).toFile(outPath);
    outputs.push({
      kind: "pdf_page",
      page,
      fileName,
      localPath: outPath,
      width: result.width,
      height: result.height,
    });
    await job.updateProgress(Math.round((page / pageFiles.length) * 90));
  }
  outputs.push(
    await makeThumb(path.join(workDir, pageFiles[0]!), path.join(workDir, "thumb_512.webp")),
  );
  return outputs;
}

async function setStatus(mediaId: string, status: ProcessingStatus, error?: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ metadata: mediaItems.metadata })
    .from(mediaItems)
    .where(eq(mediaItems.id, mediaId))
    .limit(1);
  const metadata = { ...(rows[0]?.metadata as Record<string, unknown>) };
  metadata.processing = {
    ...(metadata.processing as Record<string, unknown> | undefined),
    error: error ?? null,
    updatedAt: new Date().toISOString(),
  };
  await db
    .update(mediaItems)
    .set({ processingStatus: status, metadata, updatedAt: new Date() })
    .where(eq(mediaItems.id, mediaId));
}

async function processMedia(job: Job<MediaProcessJob>, logger: pino.Logger): Promise<void> {
  const { mediaId, treeId } = job.data;
  const db = getDb();
  const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaId)).limit(1);
  const media = rows[0];
  if (!media || media.treeId !== treeId || media.deletedAt || !media.storageKey) {
    logger.warn({ mediaId }, "media missing or deleted — skipping");
    return;
  }

  await setStatus(mediaId, "processing");
  const driver = storageDriverFor(media.storageDriver === "s3" ? "s3" : "local");
  const workDir = await mkdtemp(path.join(os.tmpdir(), "familyarchive-"));

  try {
    // Bring the original local for the external tools.
    const sourcePath = path.join(workDir, "original");
    const object = await driver.getStream(media.storageKey);
    await pipeline(object.stream, createWriteStream(sourcePath));

    let outputs: DerivativeOutput[] = [];
    if (media.mimeType.startsWith("image/")) {
      outputs = await processImage(sourcePath, workDir);
    } else if (media.mediaType === "video") {
      outputs = await processVideo(sourcePath, workDir);
    } else if (media.mediaType === "pdf") {
      outputs = await processPdf(sourcePath, workDir, job);
    } // audio and other types: no derivatives (PRD §25.2)

    for (const output of outputs) {
      const key = derivativeKey(treeId, mediaId, output.fileName);
      await driver.putStream(key, createReadStream(output.localPath), { overwrite: true });
      const size = (await stat(output.localPath)).size;
      await db
        .insert(mediaDerivatives)
        .values({
          mediaId,
          kind: output.kind,
          page: output.page,
          storageDriver: media.storageDriver,
          storageKey: key,
          mimeType: "image/webp",
          fileSize: size,
          width: output.width,
          height: output.height,
        })
        .onConflictDoUpdate({
          target: [mediaDerivatives.mediaId, mediaDerivatives.kind, mediaDerivatives.page],
          set: {
            storageDriver: media.storageDriver,
            storageKey: key,
            fileSize: size,
            width: output.width,
            height: output.height,
            createdAt: new Date(),
          },
        });
    }

    await setStatus(mediaId, "processed");
    logger.info({ mediaId, derivatives: outputs.length }, "media processed");
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export function startMediaWorker(connection: ConnectionOptions, logger: pino.Logger): Worker {
  const worker = new Worker<MediaProcessJob>(MEDIA_QUEUE, (job) => processMedia(job, logger), {
    connection,
  });

  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, mediaId: job?.data.mediaId, err: error }, "media job failed");
    if (!job) return;
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    void setStatus(job.data.mediaId, exhausted ? "failed" : "retrying", error.message).catch(
      (statusError) => logger.error({ err: statusError }, "failed to record status"),
    );
  });

  return worker;
}
