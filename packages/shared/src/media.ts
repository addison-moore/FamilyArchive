/** Media vocabulary (PRD §15). */

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

/** Media processing lifecycle (PRD §15.6). The pipeline itself lands in M7. */
export const PROCESSING_STATUSES = [
  "pending",
  "processing",
  "processed",
  "failed",
  "retrying",
] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

/**
 * Upload allowlist (PRD §31.5): accepted MIME types and the media type each
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

/** True when the browser can render this media type inline as an image. */
export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}
