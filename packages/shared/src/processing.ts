/** Media processing pipeline vocabulary (PRD §24.5, §26). */

export const MEDIA_QUEUE = "media";

export interface MediaProcessJob {
  treeId: string;
  mediaId: string;
}

export const DERIVATIVE_KINDS = ["thumb", "pdf_page", "video_thumb"] as const;
export type DerivativeKind = (typeof DERIVATIVE_KINDS)[number];

/** Long-edge pixel size for grid thumbnails (§24.5 thumb_512.webp). */
export const THUMB_SIZE = 512;

/** v1 cap on PDF page previews; the rest of the document stays readable via the original. */
export const MAX_PDF_PREVIEW_PAGES = 20;
