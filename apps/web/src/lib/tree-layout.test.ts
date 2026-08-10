import { describe, expect, it } from "vitest";

import { layoutTreeGraph, NODE_HEIGHT, NODE_WIDTH } from "@/lib/tree-layout";
import type { TreePersonNode } from "@/lib/tree-visibility";

// All names fictional.
const person = (id: string): TreePersonNode => ({
  id,
  fullName: `Test ${id}`,
  lifespan: null,
  generation: 0,
  verified: false,
});

let edgeSeq = 0;
const edge = (from: string, to: string) => ({ id: `e${++edgeSeq}`, from, to });

const graphOf = (
  people: string[],
  parentEdges: [string, string][],
  partnerEdges: [string, string][] = [],
) => ({
  people: people.map(person),
  parentEdges: parentEdges.map(([from, to]) => edge(from, to)),
  partnerEdges: partnerEdges.map(([from, to]) => edge(from, to)),
});

const centersOf = (canvas: ReturnType<typeof layoutTreeGraph>) =>
  new Map(canvas.nodes.map((node) => [node.id, { x: node.x + NODE_WIDTH / 2, y: node.y }]));

const xInterval = (centers: Map<string, { x: number; y: number }>, ids: string[]) => {
  const xs = ids.map((id) => centers.get(id)!.x);
  return { min: Math.min(...xs), max: Math.max(...xs) };
};

describe("layoutTreeGraph (union-aware)", () => {
  it("keeps each family's children together when one generation holds two families", () => {
    // Grandparents -> p1 and q1; p1+p2 have three children, q1+q2 have two.
    const canvas = layoutTreeGraph(
      graphOf(
        ["g1", "g2", "p1", "p2", "q1", "q2", "c1", "c2", "c3", "e1", "e2"],
        [
          ["g1", "p1"],
          ["g2", "p1"],
          ["g1", "q1"],
          ["g2", "q1"],
          ["p1", "c1"],
          ["p2", "c1"],
          ["p1", "c2"],
          ["p2", "c2"],
          ["p1", "c3"],
          ["p2", "c3"],
          ["q1", "e1"],
          ["q2", "e1"],
          ["q1", "e2"],
          ["q2", "e2"],
        ],
        [
          ["g1", "g2"],
          ["p1", "p2"],
          ["q1", "q2"],
        ],
      ),
      "g1",
    );
    const centers = centersOf(canvas);
    // Sibling groups must not interleave — that is what makes stems cross.
    const pKids = xInterval(centers, ["c1", "c2", "c3"]);
    const qKids = xInterval(centers, ["e1", "e2"]);
    expect(pKids.max < qKids.min || qKids.max < pKids.min).toBe(true);
    // Each couple shares a row with an empty gap between them — no third card
    // between partners (dagre may widen the gap over a wide child block, which
    // renders identically).
    for (const [a, b] of [
      ["p1", "p2"],
      ["q1", "q2"],
    ] as const) {
      expect(centers.get(a)!.y).toBe(centers.get(b)!.y);
      const lo = Math.min(centers.get(a)!.x, centers.get(b)!.x) + NODE_WIDTH / 2;
      const hi = Math.max(centers.get(a)!.x, centers.get(b)!.x) - NODE_WIDTH / 2;
      for (const node of canvas.nodes) {
        if (node.id === a || node.id === b) continue;
        if (centers.get(node.id)!.y !== centers.get(a)!.y) continue;
        expect(node.x + NODE_WIDTH <= lo || node.x >= hi).toBe(true);
      }
    }
    // Children sit on the side of their own parents.
    const pSide = (xInterval(centers, ["p1", "p2"]).min + xInterval(centers, ["p1", "p2"]).max) / 2;
    const qSide = (xInterval(centers, ["q1", "q2"]).min + xInterval(centers, ["q1", "q2"]).max) / 2;
    expect(pSide < qSide).toBe((pKids.min + pKids.max) / 2 < (qKids.min + qKids.max) / 2);
  });

  it("orders a remarried parent's partners on either side with children grouped per union", () => {
    const canvas = layoutTreeGraph(
      graphOf(
        ["maren", "elias", "ingrid", "anna", "bram", "cora"],
        [
          ["elias", "anna"],
          ["maren", "anna"],
          ["elias", "bram"],
          ["maren", "bram"],
          ["elias", "cora"],
          ["ingrid", "cora"],
        ],
        [
          ["elias", "maren"],
          ["elias", "ingrid"],
        ],
      ),
      "elias",
    );
    const centers = centersOf(canvas);
    // Partners flank the shared parent, not both on one side.
    const elias = centers.get("elias")!.x;
    const maren = centers.get("maren")!.x;
    const ingrid = centers.get("ingrid")!.x;
    expect(Math.sign(maren - elias)).not.toBe(Math.sign(ingrid - elias));
    // Each union's children stay on that union's side.
    const marenKids = xInterval(centers, ["anna", "bram"]);
    const ingridKids = xInterval(centers, ["cora"]);
    expect(marenKids.max < ingridKids.min || ingridKids.max < marenKids.min).toBe(true);
    expect((marenKids.min + marenKids.max) / 2 < (ingridKids.min + ingridKids.max) / 2).toBe(
      maren < ingrid,
    );
  });

  it("preserves the 166px person-row pitch through the union rank", () => {
    const canvas = layoutTreeGraph(
      graphOf(
        ["mom", "dad", "kid", "grandkid"],
        [
          ["mom", "kid"],
          ["dad", "kid"],
          ["kid", "grandkid"],
        ],
        [["mom", "dad"]],
      ),
      "mom",
    );
    const centers = centersOf(canvas);
    expect(centers.get("kid")!.y - centers.get("mom")!.y).toBe(NODE_HEIGHT + 90);
    expect(centers.get("grandkid")!.y - centers.get("kid")!.y).toBe(NODE_HEIGHT + 90);
  });

  it("separates cross-married sibling groups (fails on the pre-union layout)", () => {
    // Two ancestor couples whose children intermarry: without union nodes,
    // dagre orders the middle row x,w,y,z — interleaving the sibling groups so
    // family A's bus crosses w's stem. Union edges make it order x,y,w,z.
    const canvas = layoutTreeGraph(
      graphOf(
        ["a1", "a2", "b1", "b2", "x", "y", "w", "z", "k1", "k2", "k3", "k4"],
        [
          ["a1", "x"],
          ["a2", "x"],
          ["a1", "y"],
          ["a2", "y"],
          ["b1", "w"],
          ["b2", "w"],
          ["b1", "z"],
          ["b2", "z"],
          ["x", "k1"],
          ["w", "k1"],
          ["x", "k2"],
          ["w", "k2"],
          ["y", "k3"],
          ["z", "k3"],
          ["y", "k4"],
          ["z", "k4"],
        ],
        [
          ["a1", "a2"],
          ["b1", "b2"],
          ["x", "w"],
          ["y", "z"],
        ],
      ),
      "a1",
    );
    const centers = centersOf(canvas);
    const aKids = xInterval(centers, ["x", "y"]);
    const bKids = xInterval(centers, ["w", "z"]);
    expect(aKids.max < bKids.min || bKids.max < aKids.min).toBe(true);
  });

  it("places a start person with no parent edges and anchors their partner", () => {
    const canvas = layoutTreeGraph(
      graphOf(["start", "spouse"], [], [["start", "spouse"]]),
      "start",
    );
    const centers = centersOf(canvas);
    expect(centers.get("spouse")!.y).toBe(centers.get("start")!.y);
    expect(Math.abs(centers.get("spouse")!.x - centers.get("start")!.x)).toBeGreaterThanOrEqual(
      NODE_WIDTH,
    );
  });

  it("alternates satellite partners around their anchor without overlaps", () => {
    // kid has two childless partners plus ranked siblings on the same row, so
    // satellite slots must alternate sides and slide past occupied cards.
    const canvas = layoutTreeGraph(
      graphOf(
        ["mom", "dad", "kid", "sib1", "sib2", "aunt1", "aunt2"],
        [
          ["mom", "kid"],
          ["dad", "kid"],
          ["mom", "sib1"],
          ["dad", "sib1"],
          ["mom", "sib2"],
          ["dad", "sib2"],
        ],
        [
          ["mom", "dad"],
          ["kid", "aunt1"],
          ["kid", "aunt2"],
        ],
      ),
      "mom",
    );
    const centers = centersOf(canvas);
    const row = ["kid", "sib1", "sib2", "aunt1", "aunt2"];
    for (const id of row) expect(centers.get(id)!.y).toBe(centers.get("kid")!.y);
    // Opposite sides of the anchor…
    expect(Math.sign(centers.get("aunt1")!.x - centers.get("kid")!.x)).not.toBe(
      Math.sign(centers.get("aunt2")!.x - centers.get("kid")!.x),
    );
    // …and nobody on the row overlaps anybody else.
    for (const a of row) {
      for (const b of row) {
        if (a >= b) continue;
        expect(Math.abs(centers.get(a)!.x - centers.get(b)!.x)).toBeGreaterThanOrEqual(NODE_WIDTH);
      }
    }
  });

  it("still lays out a lone person and childless partner satellites", () => {
    const lone = layoutTreeGraph(graphOf(["only"], []), "only");
    expect(lone.nodes).toHaveLength(1);

    const canvas = layoutTreeGraph(
      graphOf(
        ["mom", "dad", "kid", "aunt"],
        [
          ["mom", "kid"],
          ["dad", "kid"],
        ],
        [
          ["mom", "dad"],
          ["kid", "aunt"], // childless partner -> satellite beside kid
        ],
      ),
      "mom",
    );
    const centers = centersOf(canvas);
    expect(centers.get("aunt")!.y).toBe(centers.get("kid")!.y);
    expect(Math.abs(centers.get("aunt")!.x - centers.get("kid")!.x)).toBeGreaterThanOrEqual(
      NODE_WIDTH,
    );
  });
});
