/** Face box in relative coordinates — media-size independent. */
export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Intersection-over-union of two boxes; 0 when the union is empty. */
export function iou(a: FaceBox, b: FaceBox): number {
  const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Detections that don't overlap any surviving (person-assigned or manual)
 * box — a re-run must never stack a fresh detection on top of a kept one.
 */
export function filterFreshDetections<T extends FaceBox>(
  detected: T[],
  surviving: FaceBox[],
  threshold = 0.4,
): T[] {
  return detected.filter((box) => !surviving.some((kept) => iou(box, kept) > threshold));
}
