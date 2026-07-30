/** OCR and AI-assist jobs. */

export const OCR_QUEUE = "ocr";

export interface OcrJob {
  treeId: string;
  mediaId: string;
}

export const AI_QUEUE = "ai";

export interface AiCleanupJob {
  treeId: string;
  mediaId: string;
}

/** Media types that get OCR: PDFs and scanned-document images. */
export function isOcrEligible(mediaType: string): boolean {
  return mediaType === "pdf" || mediaType === "document";
}

/** Job state tracked in media metadata.ocr / metadata.ai. */
export type TextJobStatus = "queued" | "running" | "done" | "failed";
