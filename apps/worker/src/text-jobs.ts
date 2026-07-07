import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

import { getEnv } from "@familyarchive/config";
import { getDb, mediaItems } from "@familyarchive/db";
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
import { eq } from "drizzle-orm";
import type pino from "pino";

import { storageDriverFor } from "./storage";

const execFileAsync = promisify(execFile);
const EXEC_LIMITS = { maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60 * 1000 };

/** Merge a status blob into metadata.<section> without clobbering other sections. */
async function setTextJobState(
  mediaId: string,
  section: "ocr" | "ai",
  state: { status: TextJobStatus; error?: string | null; [key: string]: unknown },
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ metadata: mediaItems.metadata })
    .from(mediaItems)
    .where(eq(mediaItems.id, mediaId))
    .limit(1);
  const metadata = { ...(rows[0]?.metadata as Record<string, unknown>) };
  metadata[section] = {
    ...(metadata[section] as Record<string, unknown> | undefined),
    ...state,
    updatedAt: new Date().toISOString(),
  };
  await db
    .update(mediaItems)
    .set({ metadata, updatedAt: new Date() })
    .where(eq(mediaItems.id, mediaId));
}

async function tesseract(imagePath: string, languages: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "tesseract",
    [imagePath, "stdout", "-l", languages, "--psm", "3"],
    EXEC_LIMITS,
  );
  return stdout.trim();
}

/** OCR job (PRD §18.2–18.3): Tesseract over the original image or 300 dpi PDF pages. */
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
    if (media.mediaType === "pdf") {
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
      text = await tesseract(sourcePath, languages);
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
      characters: text.length,
    });
    logger.info({ mediaId, pages, characters: text.length }, "ocr complete");
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

interface AiConfig {
  provider: "openai" | "anthropic";
  apiKey: string;
  model: string;
}

/** Present only when the admin explicitly configured a provider (PRD §31.4). */
export function aiConfig(): AiConfig | null {
  const env = getEnv();
  if (!env.AI_PROVIDER || !env.AI_API_KEY) return null;
  const model =
    env.AI_MODEL ?? (env.AI_PROVIDER === "anthropic" ? "claude-haiku-4-5-20251001" : "gpt-4o-mini");
  return { provider: env.AI_PROVIDER, apiKey: env.AI_API_KEY, model };
}

const CLEANUP_PROMPT =
  "The following text was extracted by OCR from a scanned family history document. " +
  "Correct obvious OCR errors, restore sensible line breaks and paragraphs, and keep the " +
  "original wording — do not modernize spelling of names or places, do not summarize, do not " +
  "add commentary. Return only the corrected text.";

async function callProvider(config: AiConfig, text: string): Promise<string> {
  const input = text.slice(0, 30_000);
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
        max_tokens: 8192,
        messages: [{ role: "user", content: `${CLEANUP_PROMPT}\n\n${input}` }],
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Anthropic API error ${response.status}: ${detail.slice(0, 300)}`);
    }
    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const out = data.content?.find((c) => c.type === "text")?.text;
    if (!out) throw new Error("Anthropic API returned no text");
    return out;
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: `${CLEANUP_PROMPT}\n\n${input}` }],
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI API error ${response.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const out = data.choices?.[0]?.message?.content;
  if (!out) throw new Error("OpenAI API returned no text");
  return out;
}

/**
 * AI OCR-cleanup job (PRD §18.4): explicit-only, requires admin-configured
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
  const cleaned = await callProvider(config, media.ocrText);
  await db
    .update(mediaItems)
    .set({ transcriptionText: cleaned, updatedAt: new Date() })
    .where(eq(mediaItems.id, mediaId));
  await setTextJobState(mediaId, "ai", {
    status: "done",
    error: null,
    provider: config.provider,
    model: config.model,
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
