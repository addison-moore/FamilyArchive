/** Face detection jobs (PRD §17, §26.4). */

export const FACES_QUEUE = "faces";

export interface FaceDetectJob {
  treeId: string;
  mediaId: string;
}

/** Face detection runs for photos only in v1 (documents get OCR instead). */
export function isFaceDetectionEligible(mediaType: string, mimeType: string): boolean {
  return mediaType === "photo" && mimeType.startsWith("image/");
}
