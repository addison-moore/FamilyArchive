import { describe, expect, it } from "vitest";

import {
  AUTO_COLLAPSE_THRESHOLD,
  buildAdjacency,
  collapseBranch,
  computeVisibleSet,
  defaultCollapseMap,
  expandBranch,
  sameCollapseView,
  type TreeGraphPayload,
} from "./tree-visibility";

/**
 * Fictional generated pedigree, `perGen` people across generations -5..+5, so
 * it clears AUTO_COLLAPSE_THRESHOLD and has people at generation <= -3 with
 * parents and >= +3 with children — the shape that makes defaultCollapseMap
 * return a non-empty map.
 */
function buildPayload(perGen: number): TreeGraphPayload {
  const people: TreeGraphPayload["people"] = [];
  const parentEdges: TreeGraphPayload["parentEdges"] = [];
  for (let g = -5; g <= 5; g++) {
    for (let i = 0; i < perGen; i++) {
      people.push({
        id: `p${g}_${i}`,
        fullName: `Person ${g}.${i} Fairweather`,
        lifespan: null,
        generation: g,
      });
      if (g > -5) parentEdges.push({ id: `e${g}_${i}`, from: `p${g - 1}_0`, to: `p${g}_${i}` });
    }
  }
  return { startId: "p0_0", people, parentEdges, partnerEdges: [] };
}

describe("sameCollapseView", () => {
  it("treats an explicit false the same as an absent flag", () => {
    // expandBranch records opened branches as `false`; that is invisible to
    // computeVisibleSet, so it must not read as a change to the view.
    expect(sameCollapseView({}, { a: { up: false } })).toBe(true);
    expect(sameCollapseView({ a: { up: false, down: false } }, {})).toBe(true);
    expect(sameCollapseView({ a: { up: true, down: false } }, { a: { up: true } })).toBe(true);
  });

  it("distinguishes a collapsed branch from an open one", () => {
    expect(sameCollapseView({ a: { up: true } }, {})).toBe(false);
    expect(sameCollapseView({ a: { up: true } }, { a: { up: false } })).toBe(false);
    expect(sameCollapseView({ a: { up: true } }, { a: { down: true } })).toBe(false);
    expect(sameCollapseView({ a: { down: true } }, { b: { down: true } })).toBe(false);
  });

  it("ignores key order and entries that carry no truthy flag", () => {
    expect(
      sameCollapseView(
        { a: { up: true }, b: { down: true } },
        { b: { down: true }, a: { up: true } },
      ),
    ).toBe(true);
    expect(sameCollapseView({ a: { up: true }, z: {} }, { a: { up: true } })).toBe(true);
  });

  it("agrees with the visible set it stands in for", () => {
    const payload = buildPayload(7);
    const adjacency = buildAdjacency(payload);
    const defaults = defaultCollapseMap(payload, adjacency);
    const opened = expandBranch(adjacency, defaults, "p-3_0", "up");

    expect(sameCollapseView(defaults, opened)).toBe(false);
    expect(computeVisibleSet(payload, adjacency, defaults).size).not.toBe(
      computeVisibleSet(payload, adjacency, opened).size,
    );

    // Collapsing it again restores the original view, so the maps must compare
    // equal even though `opened` left `false` markers behind.
    const reclosed = collapseBranch(opened, "p-3_0", "up");
    expect(sameCollapseView(defaults, reclosed)).toBe(true);
    expect(computeVisibleSet(payload, adjacency, reclosed)).toEqual(
      computeVisibleSet(payload, adjacency, defaults),
    );
  });

  it("holds across a rebuilt payload, which object identity does not", () => {
    // The regression: the tree page hands the canvas a fresh payload object on
    // every soft navigation, so `defaults` is re-memoised into a new object with
    // identical content. Comparing identity made "Reset view" appear after any
    // node click; comparing content must not.
    const first = buildPayload(7);
    const second = buildPayload(7);
    const a = defaultCollapseMap(first, buildAdjacency(first));
    const b = defaultCollapseMap(second, buildAdjacency(second));

    expect(first.people.length).toBeGreaterThan(AUTO_COLLAPSE_THRESHOLD);
    expect(Object.keys(a).length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
    expect(sameCollapseView(a, b)).toBe(true);
  });

  it("returns an empty map below the auto-collapse threshold", () => {
    const small = buildPayload(1);
    expect(small.people.length).toBeLessThanOrEqual(AUTO_COLLAPSE_THRESHOLD);
    expect(defaultCollapseMap(small, buildAdjacency(small))).toEqual({});
  });
});
