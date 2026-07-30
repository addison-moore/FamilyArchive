/** Face detection jobs. */

export const FACES_QUEUE = "faces";

export interface FaceDetectJob {
  treeId: string;
  mediaId: string;
}

/** Face detection runs for photos only in v1 (documents get OCR instead). */
export function isFaceDetectionEligible(mediaType: string, mimeType: string): boolean {
  return mediaType === "photo" && mimeType.startsWith("image/");
}
