import dagre from "@dagrejs/dagre";

import { personLifespan } from "@/components/person-summary";
import type { TreeGraph } from "@/lib/tree-graph";

export const NODE_WIDTH = 190;
export const NODE_HEIGHT = 76;

/** Plain-serializable node data passed from the server page to the client canvas. */
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

/**
 * Layered layout (PRD §11.1 "simple, readable"): dagre ranks people connected by
 * parent→child edges top-down; partner-only nodes (no parent-child edge of their
 * own in view) are placed as satellites beside their partner.
 */
export function layoutTreeGraph(graph: TreeGraph, startPersonId: string): CanvasGraph {
  const inParentEdges = new Set<string>();
  for (const edge of graph.parentEdges) {
    inParentEdges.add(edge.fromPersonId);
    inParentEdges.add(edge.toPersonId);
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 90 });
  g.setDefaultEdgeLabel(() => ({}));

  const ranked = graph.people.filter(
    ({ person }) => inParentEdges.has(person.id) || person.id === startPersonId,
  );
  for (const { person } of ranked) {
    g.setNode(person.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of graph.parentEdges) {
    g.setEdge(edge.fromPersonId, edge.toPersonId);
  }
  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const { person } of ranked) {
    const node = g.node(person.id);
    if (node) positions.set(person.id, { x: node.x - NODE_WIDTH / 2, y: node.y - NODE_HEIGHT / 2 });
  }

  // Partner satellites: place beside their (already positioned) partner.
  const satellites = graph.people.filter(({ person }) => !positions.has(person.id));
  const occupiedOffsets = new Map<string, number>(); // anchor id -> satellites placed
  for (const { person } of satellites) {
    const partnerEdge = graph.partnerEdges.find(
      (e) => e.fromPersonId === person.id || e.toPersonId === person.id,
    );
    const anchorId =
      partnerEdge &&
      (partnerEdge.fromPersonId === person.id ? partnerEdge.toPersonId : partnerEdge.fromPersonId);
    const anchor = anchorId ? positions.get(anchorId) : undefined;
    if (anchor && anchorId) {
      const already = occupiedOffsets.get(anchorId) ?? 0;
      occupiedOffsets.set(anchorId, already + 1);
      positions.set(person.id, {
        x: anchor.x + (NODE_WIDTH + 40) * (already + 1),
        y: anchor.y,
      });
    } else {
      // No positioned partner (isolated context person): park at the top-left.
      positions.set(person.id, { x: -1.5 * (NODE_WIDTH + 40), y: 0 });
    }
  }

  const nodes: CanvasNode[] = graph.people.map(({ person }) => {
    const pos = positions.get(person.id) ?? { x: 0, y: 0 };
    return {
      id: person.id,
      x: pos.x,
      y: pos.y,
      fullName: person.fullName,
      lifespan: personLifespan(person),
      isStart: person.id === startPersonId,
    };
  });

  const edges: CanvasEdge[] = [
    ...graph.parentEdges.map((e) => ({
      id: e.id,
      source: e.fromPersonId,
      target: e.toPersonId,
      kind: "parent" as const,
    })),
    ...graph.partnerEdges.map((e) => ({
      id: e.id,
      source: e.fromPersonId,
      target: e.toPersonId,
      kind: "partner" as const,
    })),
  ];

  return { nodes, edges };
}
