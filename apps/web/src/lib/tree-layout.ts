import dagre, { type Graph, type NodeLabel } from "@dagrejs/dagre";

import { deriveFamilies } from "@/lib/tree-families";
import type { TreeGraphPayload, TreePersonNode } from "@/lib/tree-visibility";

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

/** Sorts eldest first, with people whose birth date is unknown after everyone else. */
const birthOrder = (person: TreePersonNode) => person.birthSortKey ?? Number.MAX_SAFE_INTEGER;

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
 * 3. Siblings sit in birth order, with the undated after the dated and ties
 *    in the order people were supplied. Dagre is fed people and families
 *    eldest first, then seatSiblings enforces the order inside its ordering
 *    phase, because crossing minimization can still reverse siblings. Keeping
 *    a couple together outranks birth order (see seatFamily).
 * 4. Once dagre has placed the groups, each group's seats are ordered: as
 *    many partners side by side as possible, then the order that keeps each
 *    seat nearest the unions and outside partners it connects to — a child
 *    sits toward their siblings with the in-law outside, a remarried parent
 *    between partners with each union's children on its side. If nothing
 *    else decides, a couple sits in the order the partnership was recorded
 *    (HUSB before WIFE from a GEDCOM import), so it does not swap sides when
 *    the start person changes.
 * 5. Groups with nobody in a parent edge and no start person (partner-only
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
  const eldestFirst = [...graph.people].sort((a, b) => birthOrder(a) - birthOrder(b));
  const birthRank = new Map(eldestFirst.map((person, rank) => [person.id, rank]));
  // Sorted by child, so each family lists its children eldest first and a
  // remarried parent's families come in the order they started.
  const parentEdges = [...graph.parentEdges].sort(
    (a, b) => birthRank.get(a.to)! - birthRank.get(b.to)!,
  );
  const edges: CanvasEdge[] = [
    ...parentEdges.map((e) => ({
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
  for (const edge of parentEdges) {
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
    eldestFirst.map((person) => person.id),
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
  // Groups with a couple seated across them.
  const partnerNodes = new Map<string, string[]>();
  for (const [personId, partners] of links) {
    for (const partnerId of partners) {
      if (groupIndexOf.get(partnerId) !== groupIndexOf.get(personId)) {
        push(partnerNodes, nodeIdOf(personId), nodeIdOf(partnerId));
      }
    }
  }
  const siblingSets = families.map((family) => family.children.map(nodeIdOf));
  dagre.layout(g, {
    customOrder: (layered, order) => {
      order(layered, {});
      seatSiblings(layered, siblingSets, partnerNodes);
    },
  });

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
 * Groups with a head come out in their heads' order, so dagre sees siblings in
 * the order the caller supplied them, and the rest follow in the order of their
 * earliest member.
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

  return [...new Set([...heads, ...people].map((id) => groupOf.get(id)!))];
}

type OrderedNode = NodeLabel & { rank: number; order: number };

/**
 * Puts each family's children in birth order, as the end of dagre's ordering
 * phase. Dagre's rows at this point are its layered graph: groups, unions, and
 * the dummy nodes its edges pass through. Sorting the input is not enough, since
 * crossing minimization treats siblings as ties and can settle on a sweep that
 * reversed them.
 *
 * Working down from the top, each row follows the row above if that one moved,
 * which carries a sibling's descendants along with them, and then seats its
 * families. The row above then follows any seats that changed: dagre stops
 * centring parents over children whose edges it sees crossing.
 */
function seatSiblings(
  layered: Graph,
  families: string[][],
  partnerNodes: Map<string, string[]>,
): void {
  const nodeOf = (v: string) => layered.node(v) as OrderedNode;
  const siblingsOf = new Map<string, Set<string>>();
  for (const family of families) {
    for (const v of family) {
      const siblings = siblingsOf.get(v) ?? new Set<string>();
      for (const other of family) siblings.add(other);
      siblingsOf.set(v, siblings);
    }
  }

  const rows: string[][] = [];
  for (const v of layered.nodes()) {
    const { rank, order } = nodeOf(v);
    (rows[rank] ??= [])[order] = v;
  }
  let moved = false;
  rows.forEach((placed, rank) => {
    const above = rows[rank - 1];
    const aligned =
      moved && above ? alignRow(placed, above, (v) => layered.predecessors(v)) : placed;
    let row = aligned;
    for (const family of families) {
      const siblings = family.filter((v) => nodeOf(v).rank === rank);
      if (siblings.length > 1) row = seatFamily(row, siblings, partnerNodes, siblingsOf);
    }
    if (above && row.some((v, i) => v !== aligned[i])) {
      rows[rank - 1] = alignRow(above, row, (v) => layered.successors(v));
    }
    moved = row.some((v, i) => v !== placed[i]);
    rows[rank] = row;
  });
  rows.forEach((row) => {
    row.forEach((v, order) => {
      nodeOf(v).order = order;
    });
  });
}

/**
 * `row` reordered by the mean position of each node's neighbors in `fixed`. Ties
 * keep their order; a node with no neighbors keeps its slot.
 */
function alignRow(
  row: string[],
  fixed: string[],
  neighborsOf: (v: string) => string[] | undefined,
): string[] {
  const slot = new Map(fixed.map((v, i) => [v, i]));
  const center = new Map<string, number>();
  for (const v of row) {
    const neighbors = neighborsOf(v) ?? [];
    if (neighbors.length === 0) continue;
    center.set(v, neighbors.reduce((sum, n) => sum + slot.get(n)!, 0) / neighbors.length);
  }
  const sorted = row.filter((v) => center.has(v)).sort((a, b) => center.get(a)! - center.get(b)!);
  let next = 0;
  return row.map((v) => (center.has(v) ? sorted[next++]! : v));
}

/**
 * Seats one family's children (`siblings`, eldest first) together where the
 * first of them sits, so families cannot interleave.
 *
 * The exception is a couple who both have parents in view, such as cousins. If
 * only the partner's own siblings, who can make way, sit between the two
 * families, the sibling with the nearest partner takes that end of the family
 * out of birth order. One per end, since a second could not sit beside anyone.
 */
function seatFamily(
  row: string[],
  siblings: string[],
  partnerNodes: Map<string, string[]>,
  siblingsOf: Map<string, Set<string>>,
): string[] {
  const inFamily = new Set(siblings);
  const first = row.findIndex((v) => inFamily.has(v));
  const others = row.filter((v) => !inFamily.has(v));
  const before = others.slice(0, first);
  const after = others.slice(first);
  const gathered = [...before, ...siblings, ...after];
  const last = first + siblings.length - 1;

  const partnerDistance = (sibling: string, end: number, step: 1 | -1) => {
    let nearest = Infinity;
    for (const partner of partnerNodes.get(sibling) ?? []) {
      const at = gathered.indexOf(partner);
      const distance = (at - end) * step;
      if (at < 0 || distance <= 0 || distance >= nearest) continue;
      const between = step === 1 ? gathered.slice(end + 1, at) : gathered.slice(at + 1, end);
      if (between.every((other) => siblingsOf.get(partner)?.has(other))) nearest = distance;
    }
    return nearest;
  };
  const nearestToPartner = (from: string[], end: number, step: 1 | -1) => {
    const distances = from.map((sibling) => partnerDistance(sibling, end, step));
    const nearest = Math.min(...distances);
    return nearest === Infinity ? undefined : from[distances.indexOf(nearest)];
  };

  const leftmost = nearestToPartner(siblings, first, -1);
  const rest = siblings.filter((v) => v !== leftmost);
  const rightmost = nearestToPartner(rest, last, 1);
  const seated = [
    ...(leftmost ? [leftmost] : []),
    ...rest.filter((v) => v !== rightmost),
    ...(rightmost ? [rightmost] : []),
  ];
  return [...before, ...seated, ...after];
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
