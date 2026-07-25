import dagre from "@dagrejs/dagre";

import type { TreeGraphPayload, TreePersonNode } from "@/lib/tree-visibility";

export const NODE_WIDTH = 190;
export const NODE_HEIGHT = 76;
const GAP = 40;

/** A subgraph to lay out — the visible slice of the payload. */
export type LayoutGraph = Pick<TreeGraphPayload, "people" | "parentEdges" | "partnerEdges">;

/** Positioned node ready for the React Flow canvas. */
export interface CanvasNode {
  id: string;
  x: number;
  y: number;
  fullName: string;
  lifespan: string | null;
  isStart: boolean;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  kind: "parent" | "partner";
}

export interface CanvasGraph {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/** Occupied x-intervals per row, so satellites never land on other nodes. */
class RowOccupancy {
  private rows = new Map<number, Array<{ start: number; end: number }>>();

  /** Rows within half a node height count as the same visual row. */
  private rowKey(y: number): number {
    return Math.round(y / (NODE_HEIGHT / 2));
  }

  add(x: number, y: number): void {
    const key = this.rowKey(y);
    const list = this.rows.get(key) ?? [];
    list.push({ start: x, end: x + NODE_WIDTH });
    this.rows.set(key, list);
  }

  collides(x: number, y: number): boolean {
    const list = this.rows.get(this.rowKey(y));
    if (!list) return false;
    return list.some((span) => x < span.end + 12 && x + NODE_WIDTH > span.start - 12);
  }
}

/**
 * Layered layout (PRD §11.1 "simple, readable"):
 *
 * 1. dagre ranks everyone connected by parent→child edges top-down — parents
 *    above, children below.
 * 2. Partner-only "satellites" (no parent-child edge of their own in view) are
 *    placed beside their partner: first partner to the right, second to the
 *    left, then further out — so one anchor with several partners never draws
 *    a line through another partner's node. Slots that would overlap an
 *    already-placed node on the same row slide outward until clear.
 * 3. Placement runs in passes so partner-of-partner chains (A—B, B—C where
 *    only A is ranked) resolve once their anchor lands; anyone still floating
 *    afterwards parks in a stacked column at the top-left rather than on top
 *    of each other.
 */
export function layoutTreeGraph(graph: LayoutGraph, startPersonId: string): CanvasGraph {
  const inParentEdges = new Set<string>();
  for (const edge of graph.parentEdges) {
    inParentEdges.add(edge.from);
    inParentEdges.add(edge.to);
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: GAP, ranksep: 90 });
  g.setDefaultEdgeLabel(() => ({}));

  const ranked = graph.people.filter(
    (person) => inParentEdges.has(person.id) || person.id === startPersonId,
  );
  for (const person of ranked) {
    g.setNode(person.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of graph.parentEdges) {
    g.setEdge(edge.from, edge.to);
  }
  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  const occupancy = new RowOccupancy();
  for (const person of ranked) {
    const node = g.node(person.id);
    if (node) {
      const pos = { x: node.x - NODE_WIDTH / 2, y: node.y - NODE_HEIGHT / 2 };
      positions.set(person.id, pos);
      occupancy.add(pos.x, pos.y);
    }
  }

  // Partner satellites, in passes so chains anchor transitively.
  let pending: TreePersonNode[] = graph.people.filter((person) => !positions.has(person.id));
  const slotsUsed = new Map<string, number>(); // anchor id -> partner slots taken
  for (let pass = 0; pass < 4 && pending.length > 0; pass++) {
    const unresolved: typeof pending = [];
    for (const person of pending) {
      const personId = person.id;
      // Any partner edge whose other end already has a position can anchor us.
      const anchorId = graph.partnerEdges
        .filter((e) => e.from === personId || e.to === personId)
        .map((e) => (e.from === personId ? e.to : e.from))
        .find((id) => positions.has(id));
      const anchor = anchorId ? positions.get(anchorId) : undefined;
      if (!anchor || !anchorId) {
        unresolved.push(person);
        continue;
      }

      const slot = slotsUsed.get(anchorId) ?? 0;
      slotsUsed.set(anchorId, slot + 1);
      // Alternate sides: slot 0 → right, 1 → left, 2 → 2nd right, 3 → 2nd left…
      const rightSide = slot % 2 === 0;
      const distance = Math.floor(slot / 2) + 1;
      const step = (NODE_WIDTH + GAP) * (rightSide ? 1 : -1);
      let x = anchor.x + step * distance;
      // Slide outward past anything already sitting on this row.
      while (occupancy.collides(x, anchor.y)) x += step;

      const pos = { x, y: anchor.y };
      positions.set(personId, pos);
      occupancy.add(pos.x, pos.y);
    }
    pending = unresolved;
  }

  // Truly unanchored context people: park in a stacked column at the top-left.
  if (pending.length > 0) {
    const minX = Math.min(0, ...[...positions.values()].map((p) => p.x));
    pending.forEach((person, index) => {
      positions.set(person.id, {
        x: minX - NODE_WIDTH - GAP * 2,
        y: index * (NODE_HEIGHT + GAP / 2),
      });
    });
  }

  const nodes: CanvasNode[] = graph.people.map((person) => {
    const pos = positions.get(person.id) ?? { x: 0, y: 0 };
    return {
      id: person.id,
      x: pos.x,
      y: pos.y,
      fullName: person.fullName,
      lifespan: person.lifespan,
      isStart: person.id === startPersonId,
    };
  });

  // One line per couple: spouse + former-partner (etc.) edges between the same
  // pair would just draw identical overlapping dashes.
  const seenPairs = new Set<string>();
  const partnerEdges = graph.partnerEdges.filter((e) => {
    const key = [e.from, e.to].sort().join("|");
    if (seenPairs.has(key)) return false;
    seenPairs.add(key);
    return true;
  });

  const edges: CanvasEdge[] = [
    ...graph.parentEdges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      kind: "parent" as const,
    })),
    ...partnerEdges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      kind: "partner" as const,
    })),
  ];

  return { nodes, edges };
}
