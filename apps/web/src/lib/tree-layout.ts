import dagre from "@dagrejs/dagre";

import { deriveFamilies } from "@/lib/tree-families";
import type { TreeGraphPayload } from "@/lib/tree-visibility";

export const NODE_WIDTH = 190;
export const NODE_HEIGHT = 76;
export const GAP = 40;

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
  verified: boolean;
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

/** Dagre size of the invisible per-family union node (never rendered). */
const UNION_SIZE = 10;
/** Separation between the person→union and union→child ranks. Chosen so the
 * person-row pitch stays what it was with direct edges and ranksep 90:
 * 76/2 + 40 + 10 + 40 + 76/2 = 166px. */
const UNION_RANKSEP = 40;
/** Left edge to left edge of neighboring seats in a partner group. */
const SEAT_PITCH = NODE_WIDTH + GAP;
/** Largest group whose seat order is found by trying every order (7! of them
 * takes a millisecond or two). Bigger groups keep the order their partners
 * were found in. */
const MAX_PERMUTED_SEATS = 7;

const groupWidth = (size: number) => size * SEAT_PITCH - GAP;

/**
 * Layered layout:
 *
 * 1. Partners sit in groups, and each group is one dagre node as wide as its
 *    seats, so dagre's ordering (heuristic, and blind to partnerships) cannot
 *    put anyone between a couple. Each person with a parent in view heads a
 *    group, since their parents' family decides where they go. A partner with
 *    no parents in view (a married-in spouse or co-parent, a partner shown as
 *    context) has nothing above them to place them, so they join a partner's
 *    group, through other such partners if need be. Two partners who both
 *    have parents in view head separate groups and are left to dagre:
 *    siblings who marry into another set of siblings twice cannot have both
 *    couples side by side, so the connector layer falls back to behind-card
 *    lines or below-row brackets.
 * 2. Family units (tree-families) become invisible dagre "union" nodes: the
 *    parents' groups → union → each child's group replaces direct
 *    parent→child edges, so crossing minimization sees family structure —
 *    children group under their own family, and stems from different
 *    families don't cross unnecessarily. Union nodes are layout-only and
 *    never emitted.
 * 3. Once dagre has placed the groups, each group's seats are ordered: as
 *    many partners side by side as possible, then the order that keeps each
 *    seat nearest the unions and outside partners it connects to — a child
 *    sits toward their siblings with the in-law outside, a remarried parent
 *    between partners with each union's children on its side. If nothing
 *    else decides, a couple sits in the order the partnership was recorded
 *    (HUSB before WIFE from a GEDCOM import), so it does not swap sides when
 *    the start person changes.
 * 4. Groups with nobody in a parent edge and no start person (partner-only
 *    context cut off from everyone else) park in a stacked column at the
 *    top-left rather than on top of each other.
 */
export function layoutTreeGraph(graph: LayoutGraph, startPersonId: string): CanvasGraph {
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
  const { families } = deriveFamilies(edges);

  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key);
    if (!list) map.set(key, [value]);
    else if (!list.includes(value)) list.push(value);
  };
  const inParentEdges = new Set<string>();
  const parentsOf = new Map<string, string[]>(); // child -> parents
  for (const edge of graph.parentEdges) {
    inParentEdges.add(edge.from);
    inParentEdges.add(edge.to);
    push(parentsOf, edge.to, edge.from);
  }

  // Who should sit beside whom: recorded partners, and co-parents (the
  // connector draws a couple line between them either way).
  const links = new Map<string, string[]>();
  const recorded = new Map<string, string[]>(); // partner edges, from -> to
  const link = (a: string, b: string) => {
    push(links, a, b);
    push(links, b, a);
  };
  for (const edge of partnerEdges) {
    link(edge.from, edge.to);
    push(recorded, edge.from, edge.to);
  }
  for (const family of families) {
    if (family.parents.length === 2) link(family.parents[0], family.parents[1]);
  }

  const groups = groupPartners(
    graph.people.map((person) => person.id),
    links,
    parentsOf,
  );
  const groupIndexOf = new Map<string, number>();
  groups.forEach((group, index) => {
    for (const id of group) groupIndexOf.set(id, index);
  });
  const nodeIdOf = (personId: string) => `group:${groupIndexOf.get(personId)}`;
  const isRanked = (group: string[]) =>
    group.some((id) => inParentEdges.has(id) || id === startPersonId);
  const ranked = groups.filter(isRanked);

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: GAP, ranksep: UNION_RANKSEP });
  g.setDefaultEdgeLabel(() => ({}));
  for (const group of ranked) {
    // "group:" and "union:" cannot collide with each other or with person ids.
    g.setNode(nodeIdOf(group[0]!), { width: groupWidth(group.length), height: NODE_HEIGHT });
  }
  const unionIdOf = (familyKey: string) => `union:${familyKey}`;
  for (const family of families) {
    const unionId = unionIdOf(family.key);
    g.setNode(unionId, { width: UNION_SIZE, height: UNION_SIZE });
    for (const parentId of family.parents) g.setEdge(nodeIdOf(parentId), unionId);
    for (const childId of family.children) g.setEdge(unionId, nodeIdOf(childId));
  }
  dagre.layout(g);

  // What each seat is drawn toward: the unions it hangs from or drops to, and
  // partners seated in another group.
  const pulls = new Map<string, number[]>();
  const pull = (personId: string, x: number | undefined) => {
    if (x === undefined) return;
    const list = pulls.get(personId);
    if (list) list.push(x);
    else pulls.set(personId, [x]);
  };
  for (const family of families) {
    const x = g.node(unionIdOf(family.key))?.x;
    for (const id of [...family.parents, ...family.children]) pull(id, x);
  }
  for (const [personId, partners] of links) {
    for (const partnerId of partners) {
      if (groupIndexOf.get(partnerId) !== groupIndexOf.get(personId)) {
        pull(personId, g.node(nodeIdOf(partnerId))?.x);
      }
    }
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const group of ranked) {
    const node = g.node(nodeIdOf(group[0]!));
    if (!node) continue;
    const left = node.x - groupWidth(group.length) / 2;
    seatOrder(group, left, { links, recorded, pulls }).forEach((id, seat) => {
      positions.set(id, { x: left + seat * SEAT_PITCH, y: node.y - NODE_HEIGHT / 2 });
    });
  }

  // Detached context: park in a stacked column at the top-left.
  const parked = groups.filter((group) => !isRanked(group));
  if (parked.length > 0) {
    const minX = Math.min(0, ...[...positions.values()].map((p) => p.x));
    parked.forEach((group, row) => {
      const left = minX - groupWidth(group.length) - GAP * 2;
      group.forEach((id, seat) => {
        positions.set(id, { x: left + seat * SEAT_PITCH, y: row * (NODE_HEIGHT + GAP / 2) });
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
      verified: person.verified,
    };
  });

  return { nodes, edges };
}

/**
 * Split people into partner groups, each listed head first and then in the
 * order its partners were reached. A person with a parent in view heads a
 * group; a person without one joins the group of the nearest such partner
 * (ties go to whoever comes first), reached through other parentless
 * partners if need be — but never beside their own child. People with no
 * such partner at all form groups among themselves: a couple at the top of
 * the view, or the start's family in a descendants view.
 *
 * Groups come out in the order of their earliest member, so dagre still sees
 * people in the order the caller supplied them.
 */
function groupPartners(
  people: string[],
  links: Map<string, string[]>,
  parentsOf: Map<string, string[]>,
): string[][] {
  const groupOf = new Map<string, string[]>();
  const heads = people.filter((id) => parentsOf.has(id));
  for (const head of heads) groupOf.set(head, [head]);

  // Breadth-first from every head at once, so each parentless partner lands
  // in the group of the nearest head.
  const queue = [...heads];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    const group = groupOf.get(id)!;
    for (const partnerId of links.get(id) ?? []) {
      if (groupOf.has(partnerId)) continue;
      if (parentsOf.get(group[0]!)?.includes(partnerId)) continue;
      group.push(partnerId);
      groupOf.set(partnerId, group);
      queue.push(partnerId);
    }
  }

  for (const id of people) {
    if (groupOf.has(id)) continue;
    const group = [id];
    groupOf.set(id, group);
    for (let i = 0; i < group.length; i++) {
      for (const partnerId of links.get(group[i]!) ?? []) {
        if (groupOf.has(partnerId)) continue;
        group.push(partnerId);
        groupOf.set(partnerId, group);
      }
    }
  }

  return [...new Set(people.map((id) => groupOf.get(id)!))];
}

/** What seat ordering weighs, built once per layout. */
interface Seating {
  /** Partners and co-parents, both directions. */
  links: Map<string, string[]>;
  /** Recorded partner edges, from → to. */
  recorded: Map<string, string[]>;
  /** x positions each person is drawn toward. */
  pulls: Map<string, number[]>;
}

/**
 * Left-to-right seat order for one group starting at `left`, by in turn: the
 * fewest seats between linked partners, the least horizontal distance from
 * each seat to the x positions pulling on it, and the fewest couples seated
 * against their recorded direction. Remaining ties keep the group's order.
 */
function seatOrder(group: string[], left: number, seating: Seating): string[] {
  if (group.length < 2 || group.length > MAX_PERMUTED_SEATS) return group;
  const indexOf = new Map(group.map((id, index) => [id, index]));
  const pairsIn = (map: Map<string, string[]>) =>
    group.flatMap((id, index) =>
      (map.get(id) ?? []).flatMap((otherId) => {
        const other = indexOf.get(otherId);
        return other === undefined ? [] : [[index, other] as const];
      }),
    );
  const linked = pairsIn(seating.links).filter(([a, b]) => a < b);
  const recorded = pairsIn(seating.recorded);

  let best = group;
  let bestApart = Infinity;
  let bestReach = Infinity;
  let bestReversed = Infinity;
  const seatOf = new Array<number>(group.length);
  forEachPermutation(group.length, (order) => {
    order.forEach((member, seat) => (seatOf[member] = seat));
    let apart = 0;
    for (const [a, b] of linked) apart += Math.abs(seatOf[a]! - seatOf[b]!) - 1;
    if (apart > bestApart) return;
    let reach = 0;
    group.forEach((id, member) => {
      const center = left + seatOf[member]! * SEAT_PITCH + NODE_WIDTH / 2;
      for (const x of seating.pulls.get(id) ?? []) reach += Math.abs(center - x);
    });
    let reversed = 0;
    for (const [from, to] of recorded) if (seatOf[from]! > seatOf[to]!) reversed++;
    // Half a pixel of slack so float noise in dagre's coordinates cannot
    // decide between mirror-image seatings.
    const better =
      apart < bestApart ||
      reach < bestReach - 0.5 ||
      (reach <= bestReach + 0.5 && reversed < bestReversed);
    if (better) {
      best = order.map((member) => group[member]!);
      bestApart = apart;
      bestReach = reach;
      bestReversed = reversed;
    }
  });
  return best;
}

/** Calls `visit` with every ordering of 0..n-1, the identity first. */
function forEachPermutation(n: number, visit: (order: number[]) => void): void {
  const order: number[] = [];
  const used = new Array<boolean>(n).fill(false);
  const extend = () => {
    if (order.length === n) {
      visit(order);
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true;
      order.push(i);
      extend();
      order.pop();
      used[i] = false;
    }
  };
  extend();
}
