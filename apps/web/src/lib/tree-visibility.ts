/**
 * Client-side branch visibility for the tree canvas, kept simple and
 * readable even at imported-tree scale. The server ships the full reachable
 * graph (buildTreeGraph); the client decides which branches are open and lays
 * out only those. Everything here is pure and serializer-friendly.
 */

/** Plain-serializable person node passed from the server page to the canvas. */
export interface TreePersonNode {
  id: string;
  fullName: string;
  lifespan: string | null;
  /** Generation relative to the starting person (ancestors < 0). */
  generation: number;
}

/** For parent edges, `from` is the parent and `to` the child. */
export interface TreeEdge {
  id: string;
  from: string;
  to: string;
}

export interface TreeGraphPayload {
  startId: string;
  people: TreePersonNode[];
  parentEdges: TreeEdge[];
  partnerEdges: TreeEdge[];
}

/** Per-person collapse flags: `up` hides ancestors, `down` hides descendants. */
export type CollapseMap = Record<string, { up?: boolean; down?: boolean }>;
export type CollapseDirection = "up" | "down";

/** Trees larger than this start with distant generations collapsed. */
export const AUTO_COLLAPSE_THRESHOLD = 60;
/** How many generations stay open in each direction when auto-collapsing. */
export const AUTO_COLLAPSE_GENERATIONS = 3;

export interface TreeAdjacency {
  parentsOf: Map<string, string[]>;
  childrenOf: Map<string, string[]>;
  partnersOf: Map<string, string[]>;
}

export function buildAdjacency(payload: TreeGraphPayload): TreeAdjacency {
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const partnersOf = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };
  for (const edge of payload.parentEdges) {
    push(parentsOf, edge.to, edge.from);
    push(childrenOf, edge.from, edge.to);
  }
  for (const edge of payload.partnerEdges) {
    push(partnersOf, edge.from, edge.to);
    push(partnersOf, edge.to, edge.from);
  }
  return { parentsOf, childrenOf, partnersOf };
}

/**
 * The set of people to render given the collapse flags. Mirrors
 * buildTreeGraph's inclusion passes — ancestors climb, descendants walk with
 * co-parent context, the start's siblings, then partners of everyone shown —
 * except that traversal stops at collapsed nodes. The starting person is
 * always visible.
 */
export function computeVisibleSet(
  payload: TreeGraphPayload,
  adjacency: TreeAdjacency,
  collapsed: CollapseMap,
): Set<string> {
  const { parentsOf, childrenOf, partnersOf } = adjacency;
  const visible = new Set<string>([payload.startId]);

  let frontier = [payload.startId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      if (collapsed[id]?.up) continue;
      for (const parentId of parentsOf.get(id) ?? []) {
        if (!visible.has(parentId)) {
          visible.add(parentId);
          next.push(parentId);
        }
      }
    }
    frontier = next;
  }

  frontier = [payload.startId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      if (collapsed[id]?.down) continue;
      for (const childId of childrenOf.get(id) ?? []) {
        if (!visible.has(childId)) {
          visible.add(childId);
          next.push(childId);
        }
        // Co-parents are context only — shown, never recursed into.
        for (const coParentId of parentsOf.get(childId) ?? []) visible.add(coParentId);
      }
    }
    frontier = next;
  }

  // Start's siblings hang below the start's parents, so they appear only while
  // those parents are visible.
  for (const parentId of parentsOf.get(payload.startId) ?? []) {
    if (!visible.has(parentId)) continue;
    for (const childId of childrenOf.get(parentId) ?? []) visible.add(childId);
  }

  // Partners of everyone shown (single pass over the snapshot, as the server does).
  for (const id of [...visible]) {
    for (const partnerId of partnersOf.get(id) ?? []) visible.add(partnerId);
  }

  return visible;
}

/**
 * How many people are hidden beyond `id` in the given direction: the branch
 * reachable from it ignoring collapse flags (plus that branch's partner and
 * co-parent context), minus what is already visible. Drives the "▲ 12" chips;
 * 0 means nothing left to reveal.
 */
export function hiddenBeyond(
  adjacency: TreeAdjacency,
  visible: Set<string>,
  id: string,
  direction: CollapseDirection,
): number {
  const { parentsOf, childrenOf, partnersOf } = adjacency;
  const walk = direction === "up" ? parentsOf : childrenOf;
  const branch = new Set<string>();
  let frontier = [id];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const nextId of walk.get(current) ?? []) {
        if (branch.has(nextId)) continue;
        branch.add(nextId);
        next.push(nextId);
        if (direction === "down") {
          for (const coParentId of parentsOf.get(nextId) ?? []) branch.add(coParentId);
        }
      }
    }
    frontier = next;
  }
  for (const member of [...branch]) {
    for (const partnerId of partnersOf.get(member) ?? []) branch.add(partnerId);
  }
  let count = 0;
  for (const member of branch) if (!visible.has(member)) count++;
  return count;
}

/**
 * Initial collapse flags: small trees start fully expanded; larger ones show
 * AUTO_COLLAPSE_GENERATIONS in each direction with the boundary collapsed.
 */
export function defaultCollapseMap(
  payload: TreeGraphPayload,
  adjacency: TreeAdjacency,
): CollapseMap {
  if (payload.people.length <= AUTO_COLLAPSE_THRESHOLD) return {};
  const map: CollapseMap = {};
  for (const person of payload.people) {
    if (
      person.generation <= -AUTO_COLLAPSE_GENERATIONS &&
      (adjacency.parentsOf.get(person.id)?.length ?? 0) > 0
    ) {
      map[person.id] = { ...map[person.id], up: true };
    }
    if (
      person.generation >= AUTO_COLLAPSE_GENERATIONS &&
      (adjacency.childrenOf.get(person.id)?.length ?? 0) > 0
    ) {
      map[person.id] = { ...map[person.id], down: true };
    }
  }
  return map;
}

/**
 * Open a collapsed branch one generation at a time: clear the flag on `id`
 * and move the boundary to the newly revealed neighbors that themselves have
 * more branch beyond them (unless the user already toggled them explicitly).
 */
export function expandBranch(
  adjacency: TreeAdjacency,
  collapsed: CollapseMap,
  id: string,
  direction: CollapseDirection,
): CollapseMap {
  const walk = direction === "up" ? adjacency.parentsOf : adjacency.childrenOf;
  const next: CollapseMap = { ...collapsed, [id]: { ...collapsed[id], [direction]: false } };
  for (const neighborId of walk.get(id) ?? []) {
    if (collapsed[neighborId]?.[direction] !== undefined) continue;
    if ((walk.get(neighborId)?.length ?? 0) > 0) {
      next[neighborId] = { ...next[neighborId], [direction]: true };
    }
  }
  return next;
}

export function collapseBranch(
  collapsed: CollapseMap,
  id: string,
  direction: CollapseDirection,
): CollapseMap {
  return { ...collapsed, [id]: { ...collapsed[id], [direction]: true } };
}

/**
 * Do two collapse maps render the same tree? Only truthy flags reach
 * `computeVisibleSet`, so an explicit `false` — which `expandBranch` writes to
 * record a branch the user opened — counts as equal to an absent one.
 *
 * Compared by content, never identity: `defaultCollapseMap` is rebuilt whenever
 * the graph payload object is, which happens on every soft navigation even when
 * nothing about the tree changed.
 */
export function sameCollapseView(a: CollapseMap, b: CollapseMap): boolean {
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!!a[id]?.up !== !!b[id]?.up) return false;
    if (!!a[id]?.down !== !!b[id]?.down) return false;
  }
  return true;
}

/** The visible people and the edges among them, ready for layout. */
export function visibleSubgraph(
  payload: TreeGraphPayload,
  visible: Set<string>,
): Pick<TreeGraphPayload, "people" | "parentEdges" | "partnerEdges"> {
  return {
    people: payload.people.filter((person) => visible.has(person.id)),
    parentEdges: payload.parentEdges.filter((e) => visible.has(e.from) && visible.has(e.to)),
    partnerEdges: payload.partnerEdges.filter((e) => visible.has(e.from) && visible.has(e.to)),
  };
}
