import { describe, expect, it } from "vitest";

import { filterFreshDetections, iou, type FaceBox } from "./face-boxes";

function box(x: number, y: number, width: number, height: number): FaceBox {
  return { x, y, width, height };
}

describe("iou", () => {
  it("is 1 for identical boxes and 0 for disjoint ones", () => {
    expect(iou(box(0.1, 0.1, 0.2, 0.2), box(0.1, 0.1, 0.2, 0.2))).toBeCloseTo(1);
    expect(iou(box(0, 0, 0.1, 0.1), box(0.5, 0.5, 0.1, 0.1))).toBe(0);
  });

  it("computes partial overlap", () => {
    // 2x2 boxes offset by 1: intersection 2, union 6.
    expect(iou(box(0, 0, 2, 2), box(1, 0, 2, 2))).toBeCloseTo(1 / 3);
  });

  it("guards the empty-union case", () => {
    expect(iou(box(0, 0, 0, 0), box(0, 0, 0, 0))).toBe(0);
  });
});

describe("filterFreshDetections", () => {
  const kept = box(0.1, 0.1, 0.2, 0.2);

  it("drops detections overlapping a surviving box and keeps distinct ones", () => {
    const nearDuplicate = { ...box(0.11, 0.1, 0.2, 0.2), confidence: 0.9 };
    const elsewhere = { ...box(0.7, 0.7, 0.1, 0.1), confidence: 0.8 };
    const fresh = filterFreshDetections([nearDuplicate, elsewhere], [kept]);
    expect(fresh).toEqual([elsewhere]);
  });

  it("keeps everything when nothing survived", () => {
    const detections = [box(0.1, 0.1, 0.2, 0.2)];
    expect(filterFreshDetections(detections, [])).toEqual(detections);
  });

  it("treats the threshold as exclusive", () => {
    // IoU is exactly 0.5: intersection 1, union 2.
    const half = box(0, 0, 1, 2);
    expect(filterFreshDetections([half], [box(0, 0, 1, 1)], 0.5)).toEqual([half]);
    expect(filterFreshDetections([half], [box(0, 0, 1, 1)], 0.49)).toEqual([]);
  });
});
