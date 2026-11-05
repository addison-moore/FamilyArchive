import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

import { getEnv } from "@familyarchive/config";
import { getDb, mediaItems, mergeMediaMetadata } from "@familyarchive/db";
import {
  AI_QUEUE,
  isOcrEligible,
  MAX_PDF_PREVIEW_PAGES,
  OCR_QUEUE,
  type AiCleanupJob,
  type OcrJob,
  type TextJobStatus,
} from "@familyarchive/shared";
import { Worker, type ConnectionOptions, type Job } from "bullmq";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import type pino from "pino";

import { splitForCleanup } from "./ai-chunks";
import { aiConfig, type AiConfig } from "./ai-config";
import { EXEC_LIMITS } from "./exec-limits";
import { readableImagePath } from "./image-input";
import { storageDriverFor } from "./storage";

const execFileAsync = promisify(execFile);

/** Merge a status blob into metadata.<section> without clobbering other sections. */
async function setTextJobState(
  mediaId: string,
  section: "ocr" | "ai",
  state: { status: TextJobStatus; error?: string | null; [key: string]: unknown },
): Promise<void> {
  await getDb()
    .update(mediaItems)
    .set({
      metadata: mergeMediaMetadata(section, { ...state, updatedAt: new Date().toISOString() }),
      updatedAt: new Date(),
    })
    .where(eq(mediaItems.id, mediaId));
}

/** Pages in the whole document, so a capped OCR run can say what it left out. */
async function pdfPageCount(pdfPath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [pdfPath], EXEC_LIMITS);
    const match = stdout.match(/^Pages:\s+(\d+)/m);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

async function tesseract(imagePath: string, languages: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "tesseract",
    [imagePath, "stdout", "-l", languages, "--psm", "3"],
    EXEC_LIMITS,
  );
  return stdout.trim();
}

/** OCR job: Tesseract over the original image or 300 dpi PDF pages (first MAX_PDF_PREVIEW_PAGES). */
async function runOcr(job: Job<OcrJob>, logger: pino.Logger): Promise<void> {
  const { mediaId, treeId } = job.data;
  const db = getDb();
  const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaId)).limit(1);
  const media = rows[0];
  if (!media || media.treeId !== treeId || media.deletedAt || !media.storageKey) {
    logger.warn({ mediaId }, "ocr: media missing or deleted — skipping");
    return;
  }
  if (!isOcrEligible(media.mediaType)) {
    logger.info({ mediaId, mediaType: media.mediaType }, "ocr: media type not eligible");
    return;
  }

  await setTextJobState(mediaId, "ocr", { status: "running", error: null });
  const env = getEnv();
  const languages = env.OCR_LANGUAGES;
  const driver = storageDriverFor(media.storageDriver === "s3" ? "s3" : "local");
  const workDir = await mkdtemp(path.join(os.tmpdir(), "familyarchive-ocr-"));

  try {
    const sourcePath = path.join(workDir, "original");
    const object = await driver.getStream(media.storageKey);
    await pipeline(object.stream, createWriteStream(sourcePath));

    let text: string;
    let pages = 1;
    let totalPages: number | null = 1;
    // By MIME type: a PDF filed as a document is still a PDF, and handing Tesseract
    // the raw file failed every time.
    if (media.mimeType === "application/pdf") {
      totalPages = await pdfPageCount(sourcePath);
      // Higher DPI than the visual previews — Tesseract needs ~300 dpi.
      await execFileAsync(
        "pdftoppm",
        [
          "-png",
          "-r",
          "300",
          "-gray",
          "-l",
          String(MAX_PDF_PREVIEW_PAGES),
          sourcePath,
          path.join(workDir, "ocr"),
        ],
        EXEC_LIMITS,
      );
      const pageFiles = (await readdir(workDir))
        .filter((name) => /^ocr-\d+\.png$/.test(name))
        .sort();
      if (pageFiles.length === 0) throw new Error("PDF produced no pages to OCR");
      pages = pageFiles.length;
      const parts: string[] = [];
      for (const [index, name] of pageFiles.entries()) {
        const pageText = await tesseract(path.join(workDir, name), languages);
        parts.push(pages > 1 ? `--- Page ${index + 1} ---\n${pageText}` : pageText);
        await job.updateProgress(Math.round(((index + 1) / pageFiles.length) * 100));
      }
      text = parts.join("\n\n");
    } else {
      text = await tesseract(
        await readableImagePath(sourcePath, media.mimeType, workDir),
        languages,
      );
    }

    await db
      .update(mediaItems)
      .set({ ocrText: text || null, updatedAt: new Date() })
      .where(eq(mediaItems.id, mediaId));
    await setTextJobState(mediaId, "ocr", {
      status: "done",
      error: null,
      engine: "tesseract",
      languages,
      pages,
      totalPages,
      characters: text.length,
    });
    logger.info({ mediaId, pages, characters: text.length }, "ocr complete");
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

const CLEANUP_PROMPT =
  "The following text was extracted by OCR from a scanned family history document. " +
  "Correct obvious OCR errors, restore sensible line breaks and paragraphs, and keep the " +
  "original wording — do not modernize spelling of names or places, do not summarize, do not " +
  "add commentary. Return only the corrected text.";

/** A provider that never answers must not hold the AI worker forever. */
const PROVIDER_TIMEOUT_MS = 5 * 60 * 1000;

/** A reply that stopped early is a shortened transcription, so it is a failure. */
function assertComplete(provider: string, stopReason: string | null | undefined, stops: string[]) {
  if (stopReason && stops.includes(stopReason)) {
    throw new Error(`${provider} stopped before finishing (${stopReason})`);
  }
}

async function callProvider(config: AiConfig, text: string): Promise<string> {
  const content = `${CLEANUP_PROMPT}\n\n${text}`;
  if (config.provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        // Generous on purpose: on current models thinking counts toward this cap.
        max_tokens: 16_000,
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Anthropic API error ${response.status}: ${detail.slice(0, 300)}`);
    }
    const data = (await response.json()) as {
      content?: { type: string; text?: string }[];
      stop_reason?: string | null;
    };
    assertComplete("Anthropic", data.stop_reason, ["max_tokens", "refusal"]);
    // Found by type: a response can open with thinking blocks.
    const out = data.content?.find((c) => c.type === "text")?.text;
    if (!out) throw new Error("Anthropic API returned no text");
    return out;
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI API error ${response.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await response.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string | null }[];
  };
  assertComplete("OpenAI", data.choices?.[0]?.finish_reason, ["length", "content_filter"]);
  const out = data.choices?.[0]?.message?.content;
  if (!out) throw new Error("OpenAI API returned no text");
  return out;
}

/**
 * AI OCR-cleanup job: explicit-only, requires admin-configured
 * provider, writes to transcription_text only when it is empty so raw OCR and
 * manual transcriptions are never overwritten.
 */
async function runAiCleanup(job: Job<AiCleanupJob>, logger: pino.Logger): Promise<void> {
  const { mediaId, treeId } = job.data;
  const config = aiConfig();
  if (!config) throw new Error("No AI provider configured (AI_PROVIDER / AI_API_KEY)");

  const db = getDb();
  const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaId)).limit(1);
  const media = rows[0];
  if (!media || media.treeId !== treeId || media.deletedAt) return;
  if (!media.ocrText?.trim()) throw new Error("No OCR text to clean up — run OCR first");
  if (media.transcriptionText?.trim()) {
    throw new Error("A transcription already exists; clear it first to use AI cleanup");
  }

  await setTextJobState(mediaId, "ai", { status: "running", error: null });
  const chunks = splitForCleanup(media.ocrText);
  const cleaned: string[] = [];
  for (const [index, chunk] of chunks.entries()) {
    cleaned.push((await callProvider(config, chunk)).trim());
    await job.updateProgress(Math.round(((index + 1) / chunks.length) * 100));
  }
  // Checked again in the write itself: this job can run for minutes, and someone
  // may have saved a transcription by hand in the meantime.
  const written = await db
    .update(mediaItems)
    .set({ transcriptionText: cleaned.join("\n\n"), updatedAt: new Date() })
    .where(
      and(
        eq(mediaItems.id, mediaId),
        or(isNull(mediaItems.transcriptionText), sql`trim(${mediaItems.transcriptionText}) = ''`),
      ),
    )
    .returning({ id: mediaItems.id });
  await setTextJobState(mediaId, "ai", {
    status: "done",
    error: null,
    provider: config.provider,
    model: config.model,
    chunks: chunks.length,
    ...(written.length === 0 ? { discarded: "a transcription was saved while this ran" } : {}),
  });
  logger.info({ mediaId, provider: config.provider }, "ai cleanup complete");
}

export function startTextWorkers(connection: ConnectionOptions, logger: pino.Logger): Worker[] {
  const ocrWorker = new Worker<OcrJob>(OCR_QUEUE, (job) => runOcr(job, logger), { connection });
  ocrWorker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, err: error }, "ocr job failed");
    if (!job) return;
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    void setTextJobState(job.data.mediaId, "ocr", {
      status: exhausted ? "failed" : "queued",
      error: error.message,
    }).catch(() => {});
  });

  const aiWorker = new Worker<AiCleanupJob>(AI_QUEUE, (job) => runAiCleanup(job, logger), {
    connection,
  });
  aiWorker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, err: error }, "ai job failed");
    if (!job) return;
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    void setTextJobState(job.data.mediaId, "ai", {
      status: exhausted ? "failed" : "queued",
      error: error.message,
    }).catch(() => {});
  });

  return [ocrWorker, aiWorker];
}
