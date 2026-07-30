import type { Edge } from "@xyflow/react";

import { deriveFamilies, type FamilyUnit } from "@/lib/tree-families";
import { GAP, NODE_HEIGHT, NODE_WIDTH, type CanvasEdge, type CanvasNode } from "@/lib/tree-layout";

/**
 * Ancestry-style connectors: instead of one edge per parent-child pair, children
 * are grouped into family units — one junction per couple (dot on the partner
 * line) or per lone parent, with a single stem descending to a horizontal bus
 * that drops onto each child. Runs after layout on the visible subgraph, so
 * collapse states degrade automatically (a hidden co-parent leaves a solo
 * family; a couple with every shared child hidden reverts to a plain partner
 * line).
 */

/** Vertical clearance between a family bus and the tops of the child cards it feeds. */
export const BUS_OFFSET = 28;
/** Extra lift per collision level when two families' buses would merge on one row. */
export const BUS_STAGGER = 6;
/** Facing-edge gap at or below which same-row partners count as adjacent.
 * The union-aware layout often settles couples ~155px apart when balancing
 * them over a wide child block; anything under ~214px (card + occupancy
 * margins) cannot contain another card, so treating gaps this size as
 * adjacent is safe and keeps true couples' routing priority. */
export const ADJACENT_GAP_MAX = 200;
export const DOT_RADIUS = 4;
/** How far below the row the junction sits when the mid-height line is unusable. */
const BELOW_ROW_OFFSET = 24;
/** Same-row tolerance, matching the layout's satellite placement. */
const SAME_ROW_EPSILON = 8;
/** ±steps of GAP/2 tried when nudging a non-adjacent couple's dot off a card
 * (6 × 20px clears a full card width from its center). */
const MAX_NUDGE_STEPS = 6;

export type CoupleEdgeData = {
  path: string;
  dotX: number | null;
  dotY: number | null;
  variant: "union" | "partnerOnly";
};
export type FamilyEdgeData = { path: string };

export type CoupleFlowEdge = Edge<CoupleEdgeData, "couple">;
export type FamilyFlowEdge = Edge<FamilyEdgeData, "family">;
export type ConnectorFlowEdge = CoupleFlowEdge | FamilyFlowEdge;

interface Point {
  x: number;
  y: number;
}

interface Span {
  start: number;
  end: number;
}

const overlaps = (a: Span, b: Span, margin = 0) =>
  a.start - margin < b.end && a.end + margin > b.start;

/** Occupied x-spans per visual row, for keeping the junction dot off cards.
 * Keyed by card-top y, like the layout's RowOccupancy. */
type RowIndex = Map<number, Span[]>;

const rowKey = (y: number) => Math.round(y / (NODE_HEIGHT / 2));

function buildRowIndex(nodes: CanvasNode[]): RowIndex {
  const rows: RowIndex = new Map();
  for (const node of nodes) {
    const key = rowKey(node.y);
    const list = rows.get(key) ?? [];
    list.push({ start: node.x, end: node.x + NODE_WIDTH });
    rows.set(key, list);
  }
  return rows;
}

/** Whether a dot centered at x would touch a card on the row whose tops sit at rowTopY. */
function dotBlocked(rows: RowIndex, x: number, rowTopY: number): boolean {
  const margin = DOT_RADIUS + 2;
  const spans = rows.get(rowKey(rowTopY));
  if (!spans) return false;
  return spans.some((span) => x + margin > span.start && x - margin < span.end);
}

interface CoupleGeometry {
  path: string;
  /** Junction: where the dot sits and the family stem starts. */
  junction: Point;
}

/**
 * Geometry for all couple connectors of one canvas. Mid-height line segments
 * are claimed per row so interleaved couples (e.g. two siblings married to two
 * siblings) don't draw collinear overlapping lines — later claimants fall back
 * to a below-row bracket. Callers must request adjacent couples before
 * non-adjacent ones so a wide line never steals an adjacent couple's gap.
 */
class CoupleRouter {
  private claimed: Map<number, Span[]> = new Map();

  constructor(private rows: RowIndex) {}

  private claim(row: number, span: Span): void {
    const list = this.claimed.get(row) ?? [];
    list.push(span);
    this.claimed.set(row, list);
  }

  private lineFree(row: number, span: Span): boolean {
    return !(this.claimed.get(row) ?? []).some((other) => overlaps(span, other));
  }

  route(a: CanvasNode, b: CanvasNode): CoupleGeometry {
    const [left, right] = a.x <= b.x ? [a, b] : [b, a];

    if (Math.abs(left.y - right.y) >= SAME_ROW_EPSILON) return this.routeCrossRow(left, right);

    const rowTopY = (left.y + right.y) / 2;
    const row = rowKey(rowTopY);
    const midY = rowTopY + NODE_HEIGHT / 2;
    const gapStart = left.x + NODE_WIDTH;
    const gapEnd = right.x;
    const span = { start: gapStart, end: gapEnd };
    const line = `M ${gapStart},${midY} H ${gapEnd}`;

    if (this.lineFree(row, span)) {
      if (gapEnd - gapStart <= ADJACENT_GAP_MAX) {
        this.claim(row, span);
        return { path: line, junction: { x: (gapStart + gapEnd) / 2, y: midY } };
      }
      // Non-adjacent: the line passes behind intervening cards (they render
      // above edges); hunt a free spot for the dot near the midpoint of card
      // centers.
      const target = (left.x + right.x) / 2 + NODE_WIDTH / 2;
      for (let step = 0; step <= MAX_NUDGE_STEPS; step++) {
        for (const direction of step === 0 ? [1] : [1, -1]) {
          const x = target + direction * step * (GAP / 2);
          if (x > gapStart && x < gapEnd && !dotBlocked(this.rows, x, rowTopY)) {
            this.claim(row, span);
            return { path: line, junction: { x, y: midY } };
          }
        }
      }
    }

    // Mid-height line unusable (span already claimed, or no free dot spot):
    // bracket below the row. Brackets are rare enough that they don't claim
    // or dodge each other.
    const jy = Math.max(left.y, right.y) + NODE_HEIGHT + BELOW_ROW_OFFSET;
    const leftCenterX = left.x + NODE_WIDTH / 2;
    const rightCenterX = right.x + NODE_WIDTH / 2;
    return {
      path: `M ${leftCenterX},${left.y + NODE_HEIGHT} V ${jy} H ${rightCenterX} V ${right.y + NODE_HEIGHT}`,
      junction: { x: (leftCenterX + rightCenterX) / 2, y: jy },
    };
  }

  /**
   * Cross-row couple (a partner ranked into another generation): orthogonal
   * step at each card's mid-height. The dot rides the lower segment so the
   * family stem always descends.
   */
  private routeCrossRow(left: CanvasNode, right: CanvasNode): CoupleGeometry {
    const [lower, upper] = left.y > right.y ? [left, right] : [right, left];
    const lowerMidY = lower.y + NODE_HEIGHT / 2;
    const upperMidY = upper.y + NODE_HEIGHT / 2;
    let lowerFacingX = lower === left ? lower.x + NODE_WIDTH : lower.x;
    let upperFacingX = upper === left ? upper.x + NODE_WIDTH : upper.x;

    if (
      (lower === left && lowerFacingX > upperFacingX) ||
      (lower === right && lowerFacingX < upperFacingX)
    ) {
      // Cards overlap horizontally — the facing edges point the wrong way and
      // a mid-gap elbow would double back through both cards. Route around
      // the outside instead: out of both right edges to a shared elbow.
      lowerFacingX = lower.x + NODE_WIDTH;
      upperFacingX = upper.x + NODE_WIDTH;
      const jx = Math.max(lowerFacingX, upperFacingX) + GAP / 2;
      return {
        path: `M ${lowerFacingX},${lowerMidY} H ${jx} V ${upperMidY} H ${upperFacingX}`,
        junction: { x: jx, y: lowerMidY },
      };
    }

    // Nudge the dot along the lower segment if a card on the lower row covers
    // the midpoint (edges render underneath cards).
    const lo = Math.min(lowerFacingX, upperFacingX);
    const hi = Math.max(lowerFacingX, upperFacingX);
    let jx = (lo + hi) / 2;
    for (let step = 0; step <= MAX_NUDGE_STEPS; step++) {
      const candidates = step === 0 ? [jx] : [jx + step * (GAP / 2), jx - step * (GAP / 2)];
      const free = candidates.find((x) => x > lo && x < hi && !dotBlocked(this.rows, x, lower.y));
      if (free !== undefined) {
        jx = free;
        break;
      }
    }
    return {
      path: `M ${lowerFacingX},${lowerMidY} H ${jx} V ${upperMidY} H ${upperFacingX}`,
      junction: { x: jx, y: lowerMidY },
    };
  }
}

function familyPath(junction: Point, children: CanvasNode[], busY: number): string {
  const drops = children.map((child) => ({ x: child.x + NODE_WIDTH / 2, topY: child.y }));
  const only = drops.length === 1 ? drops[0] : undefined;
  if (only && Math.abs(only.x - junction.x) < 1) {
    return `M ${junction.x},${junction.y} V ${only.topY}`;
  }
  const xs = [junction.x, ...drops.map((drop) => drop.x)];
  let path = `M ${junction.x},${junction.y} V ${busY}`;
  path += ` M ${Math.min(...xs)},${busY} H ${Math.max(...xs)}`;
  for (const drop of drops) path += ` M ${drop.x},${busY} V ${drop.topY}`;
  return path;
}

/**
 * The full connector edge set for the canvas. Paths are precomputed in flow
 * coordinates from the laid-out nodes — valid only while nodes cannot move
 * (nodesDraggable is off; drag-editing is out of scope for v1).
 *
 * Family edges come first so couple edges' junction dots paint over the stem
 * joints (same SVG layer, DOM order).
 */
export function buildConnectorEdges(nodes: CanvasNode[], edges: CanvasEdge[]): ConnectorFlowEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const router = new CoupleRouter(buildRowIndex(nodes));
  const { families, partnerPairs } = deriveFamilies(edges);
  const inert = { selectable: false, focusable: false, interactionWidth: 0 } as const;

  // Resolve every couple connector (families with two parents + childless
  // partner pairs) before routing, so routing order can be controlled:
  // same-row adjacent couples first (they must keep their gap), then by
  // leftmost x for determinism.
  interface CoupleRequest {
    id: string;
    a: CanvasNode;
    b: CanvasNode;
    variant: CoupleEdgeData["variant"];
    familyKey: string | null;
  }
  const requests: CoupleRequest[] = [];

  interface FamilyPlan {
    family: FamilyUnit;
    children: CanvasNode[];
    junction: Point | null; // couples resolve after routing
  }
  const plans: FamilyPlan[] = [];

  for (const family of families) {
    const children = [...family.children]
      .sort()
      .map((id) => nodeById.get(id))
      .filter((node): node is CanvasNode => node !== undefined);
    if (children.length === 0) continue;

    if (family.parents.length === 2) {
      const first = nodeById.get(family.parents[0]);
      const second = nodeById.get(family.parents[1]);
      if (!first || !second) continue;
      requests.push({
        id: family.partnerEdgeId ?? family.key,
        a: first,
        b: second,
        variant: "union",
        familyKey: family.key,
      });
      plans.push({ family, children, junction: null });
    } else {
      const parent = nodeById.get(family.parents[0]);
      if (!parent) continue;
      plans.push({
        family,
        children,
        junction: { x: parent.x + NODE_WIDTH / 2, y: parent.y + NODE_HEIGHT },
      });
    }
  }

  for (const pair of partnerPairs) {
    const a = nodeById.get(pair.a);
    const b = nodeById.get(pair.b);
    if (!a || !b) continue;
    requests.push({ id: pair.id, a, b, variant: "partnerOnly", familyKey: null });
  }

  const facingGap = (request: CoupleRequest) => Math.abs(request.a.x - request.b.x) - NODE_WIDTH;
  requests.sort((a, b) => {
    const aAdjacent = facingGap(a) <= ADJACENT_GAP_MAX ? 0 : 1;
    const bAdjacent = facingGap(b) <= ADJACENT_GAP_MAX ? 0 : 1;
    if (aAdjacent !== bAdjacent) return aAdjacent - bAdjacent;
    const byX = Math.min(a.a.x, a.b.x) - Math.min(b.a.x, b.b.x);
    return byX !== 0 ? byX : a.id.localeCompare(b.id);
  });

  const junctionByFamily = new Map<string, Point>();
  const coupleEdges: CoupleFlowEdge[] = requests.map((request) => {
    const [source, target] =
      request.a.x <= request.b.x ? [request.a, request.b] : [request.b, request.a];
    const geometry = router.route(request.a, request.b);
    if (request.familyKey) junctionByFamily.set(request.familyKey, geometry.junction);
    return {
      id: request.id,
      source: source.id,
      target: target.id,
      sourceHandle: "right-source",
      targetHandle: "left-target",
      type: "couple",
      data: {
        path: geometry.path,
        dotX: request.variant === "union" ? geometry.junction.x : null,
        dotY: request.variant === "union" ? geometry.junction.y : null,
        variant: request.variant,
      },
      ...inert,
    };
  });

  // Bus levels: families whose buses share a child row and would overlap or
  // abut (e.g. a couple plus a step-parent of one of its children) are lifted
  // apart so their sibling lines cannot fuse into one.
  interface BusPlan extends FamilyPlan {
    junction: Point;
    dropXs: number[];
    span: Span;
    minChildTop: number;
    hasBus: boolean;
  }
  const busPlans: BusPlan[] = plans.flatMap((plan) => {
    const junction = plan.junction ?? junctionByFamily.get(plan.family.key) ?? null;
    if (!junction) return [];
    const dropXs = plan.children.map((child) => child.x + NODE_WIDTH / 2);
    const minChildTop = Math.min(...plan.children.map((child) => child.y));
    const hasBus = !(dropXs.length === 1 && Math.abs((dropXs[0] ?? 0) - junction.x) < 1);
    return [
      {
        ...plan,
        junction,
        dropXs,
        span: {
          start: Math.min(junction.x, ...dropXs),
          end: Math.max(junction.x, ...dropXs),
        },
        minChildTop,
        hasBus,
      },
    ];
  });

  // A drop from an UPPER bus crosses a LOWER bus wherever the lower family's
  // span covers that drop's x. Families whose drops sit inside other spans on
  // their row therefore go LOWEST (level 0), so their drops never have a bus
  // to cross — processed first, first-fit levels handle the rest.
  const coveredDrops = (plan: BusPlan) => {
    const row = rowKey(plan.minChildTop);
    return plan.dropXs.filter((x) =>
      busPlans.some(
        (other) =>
          other !== plan &&
          other.hasBus &&
          rowKey(other.minChildTop) === row &&
          x >= other.span.start &&
          x <= other.span.end,
      ),
    ).length;
  };

  const levelsByRow = new Map<number, Span[][]>();
  const familyEdges: FamilyFlowEdge[] = busPlans
    .sort(
      (a, b) =>
        coveredDrops(b) - coveredDrops(a) ||
        a.span.start - b.span.start ||
        a.family.key.localeCompare(b.family.key),
    )
    .map((plan) => {
      let level = 0;
      if (plan.hasBus) {
        const row = rowKey(plan.minChildTop);
        const levels = levelsByRow.get(row) ?? [];
        while (levels[level]?.some((other) => overlaps(plan.span, other, 8))) level++;
        (levels[level] ??= []).push(plan.span);
        levelsByRow.set(row, levels);
      }
      const busY = plan.minChildTop - BUS_OFFSET - level * BUS_STAGGER;
      const firstChild = plan.children[0];
      return {
        id: `fam:${plan.family.key}`,
        source: plan.family.parents[0],
        target: firstChild?.id ?? plan.family.parents[0],
        sourceHandle: "bottom",
        targetHandle: "top",
        type: "family" as const,
        data: { path: familyPath(plan.junction, plan.children, busY) },
        ...inert,
      };
    });

  return [...familyEdges, ...coupleEdges];
}
