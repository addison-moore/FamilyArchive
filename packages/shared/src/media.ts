/** Media vocabulary. */

export const MEDIA_TYPES = ["photo", "video", "audio", "pdf", "document"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  photo: "Photo",
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
  document: "Document",
};

export function isMediaType(value: unknown): value is MediaType {
  return typeof value === "string" && (MEDIA_TYPES as readonly string[]).includes(value);
}

/** Media processing lifecycle states. */
export const PROCESSING_STATUSES = [
  "pending",
  "processing",
  "processed",
  "failed",
  "retrying",
] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

/**
 * Upload allowlist: accepted MIME types and the media type each
 * maps to. Extensions are derived from this table, never from user filenames.
 */
export const UPLOAD_MIME_TYPES: Record<string, { mediaType: MediaType; extension: string }> = {
  "image/jpeg": { mediaType: "photo", extension: "jpg" },
  "image/png": { mediaType: "photo", extension: "png" },
  "image/webp": { mediaType: "photo", extension: "webp" },
  "image/gif": { mediaType: "photo", extension: "gif" },
  "image/heic": { mediaType: "photo", extension: "heic" },
  "image/tiff": { mediaType: "photo", extension: "tif" },
  "video/mp4": { mediaType: "video", extension: "mp4" },
  "video/webm": { mediaType: "video", extension: "webm" },
  "video/quicktime": { mediaType: "video", extension: "mov" },
  "audio/mpeg": { mediaType: "audio", extension: "mp3" },
  "audio/mp4": { mediaType: "audio", extension: "m4a" },
  "audio/x-m4a": { mediaType: "audio", extension: "m4a" },
  "audio/wav": { mediaType: "audio", extension: "wav" },
  "audio/x-wav": { mediaType: "audio", extension: "wav" },
  "audio/ogg": { mediaType: "audio", extension: "ogg" },
  "application/pdf": { mediaType: "pdf", extension: "pdf" },
};

/**
 * The labels a file can honestly carry. Which tools process a file, and how a
 * page shows it, follow from its MIME type, so the type picker must not offer a
 * label that contradicts it: a video filed under "Photo" lost its player. A photo
 * or PDF can also be filed as a document, which is what offers OCR on a scan.
 */
export function mediaTypesForMime(mimeType: string): MediaType[] {
  if (mimeType === "application/pdf") return ["pdf", "document"];
  if (mimeType.startsWith("image/")) return ["photo", "document"];
  if (mimeType.startsWith("video/")) return ["video"];
  if (mimeType.startsWith("audio/")) return ["audio"];
  return [...MEDIA_TYPES];
}

/** "1.2 GB", "3.4 MB", "120 KB", "512 B". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.max(0, bytes)} B`;
}

/** True when this is an image of any kind — including ones browsers cannot decode. */
export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/**
 * Image formats accepted on upload that no mainstream browser can decode.
 * HEIC renders only in Safari; TIFF in none of Chrome, Firefox or Edge.
 */
const NON_RENDERABLE_IMAGE_MIMES = new Set(["image/heic", "image/heif", "image/tiff"]);

/**
 * True when an `<img>` pointed at the original will actually display. The
 * upload allowlist is deliberately wider than this, and there is no full-size
 * derivative to fall back on — only a 512px thumbnail — so anything failing
 * this check has to be offered as a download rather than shown inline.
 */
export function isBrowserRenderableImage(mimeType: string): boolean {
  return isImageMime(mimeType) && !NON_RENDERABLE_IMAGE_MIMES.has(mimeType.toLowerCase());
}
