import { describe, expect, it } from "vitest";

import {
  ADJACENT_GAP_MAX,
  BUS_OFFSET,
  BUS_STAGGER,
  buildConnectorEdges,
  type CoupleFlowEdge,
  type FamilyFlowEdge,
} from "@/lib/tree-connectors";
import { deriveFamilies } from "@/lib/tree-families";
import { GAP, NODE_HEIGHT, NODE_WIDTH, type CanvasEdge, type CanvasNode } from "@/lib/tree-layout";

// All names fictional (PRD §1.5).
const person = (id: string, x: number, y: number): CanvasNode => ({
  id,
  x,
  y,
  fullName: `Test ${id}`,
  lifespan: null,
  isStart: false,
});

let edgeSeq = 0;
const parent = (source: string, target: string, id?: string): CanvasEdge => ({
  id: id ?? `pe${++edgeSeq}`,
  source,
  target,
  kind: "parent",
});
const partner = (source: string, target: string, id?: string): CanvasEdge => ({
  id: id ?? `sp${++edgeSeq}`,
  source,
  target,
  kind: "partner",
});

const couples = (edges: ReturnType<typeof buildConnectorEdges>) =>
  edges.filter((edge): edge is CoupleFlowEdge => edge.type === "couple");
const familyEdges = (edges: ReturnType<typeof buildConnectorEdges>) =>
  edges.filter((edge): edge is FamilyFlowEdge => edge.type === "family");

/** Two adjacent parents on one row with two children below. */
const coupleNodes = () => [
  person("mom", 0, 0),
  person("dad", NODE_WIDTH + GAP, 0),
  person("kid1", 0, 200),
  person("kid2", NODE_WIDTH + GAP, 200),
];
const coupleEdgesInput = () => [
  partner("mom", "dad", "rel-partner"),
  parent("mom", "kid1"),
  parent("dad", "kid1"),
  parent("mom", "kid2"),
  parent("dad", "kid2"),
];

describe("deriveFamilies", () => {
  it("groups a two-parent family into one couple unit and suppresses the partner pair", () => {
    const { families, partnerPairs } = deriveFamilies(coupleEdgesInput());
    expect(families).toHaveLength(1);
    expect(families[0]?.parents).toEqual(["dad", "mom"]);
    expect([...(families[0]?.children ?? [])].sort()).toEqual(["kid1", "kid2"]);
    expect(families[0]?.partnerEdgeId).toBe("rel-partner");
    expect(partnerPairs).toHaveLength(0);
  });

  it("keeps a couple unit for co-parents without a partner edge", () => {
    const { families, partnerPairs } = deriveFamilies([
      parent("mom", "kid1"),
      parent("dad", "kid1"),
    ]);
    expect(families).toHaveLength(1);
    expect(families[0]?.parents).toEqual(["dad", "mom"]);
    expect(families[0]?.partnerEdgeId).toBeNull();
    expect(partnerPairs).toHaveLength(0);
  });

  it("makes a solo family for a single parent", () => {
    const { families } = deriveFamilies([parent("mom", "kid1")]);
    expect(families).toEqual([
      { key: "solo:mom", parents: ["mom"], children: ["kid1"], partnerEdgeId: null },
    ]);
  });

  it("partitions three or more parents: partnered pair keeps the couple, the rest go solo", () => {
    const { families } = deriveFamilies([
      partner("mom", "dad"),
      parent("mom", "kid1"),
      parent("dad", "kid1"),
      parent("step", "kid1"),
    ]);
    const keys = families.map((family) => family.key).sort();
    expect(keys).toEqual(["couple:dad|mom", "solo:step"]);
    for (const family of families) expect(family.children).toEqual(["kid1"]);
  });

  it("splits every parent solo when three or more parents share no partner edge", () => {
    const { families } = deriveFamilies([
      parent("a", "kid1"),
      parent("b", "kid1"),
      parent("c", "kid1"),
    ]);
    expect(families.map((family) => family.key).sort()).toEqual(["solo:a", "solo:b", "solo:c"]);
  });

  it("groups children per couple for a person with multiple partners", () => {
    const { families } = deriveFamilies([
      partner("anna", "ben"),
      partner("anna", "carl"),
      parent("anna", "kid1"),
      parent("ben", "kid1"),
      parent("anna", "kid2"),
      parent("carl", "kid2"),
    ]);
    const byKey = new Map(families.map((family) => [family.key, family]));
    expect(byKey.get("couple:anna|ben")?.children).toEqual(["kid1"]);
    expect(byKey.get("couple:anna|carl")?.children).toEqual(["kid2"]);
    expect(families).toHaveLength(2);
  });

  it("dedupes duplicate relationship rows between the same pair", () => {
    const { families, partnerPairs } = deriveFamilies([
      partner("mom", "dad", "rel-spouse"),
      partner("dad", "mom", "rel-divorced"),
      parent("mom", "kid1", "rel-bio"),
      parent("mom", "kid1", "rel-guardian"),
    ]);
    // Solo family (dad is not kid1's parent) with a single drop despite two parent rows.
    expect(families).toHaveLength(1);
    expect(families[0]?.key).toBe("solo:mom");
    expect(families[0]?.parents).toEqual(["mom"]);
    expect(families[0]?.children).toEqual(["kid1"]);
    // One partner line despite two partner rows, keyed by the first relationship id.
    expect(partnerPairs).toEqual([{ id: "rel-spouse", a: "dad", b: "mom" }]);
  });

  it("reports childless partner pairs for plain dashed rendering", () => {
    const { families, partnerPairs } = deriveFamilies([partner("mom", "dad", "rel-partner")]);
    expect(families).toHaveLength(0);
    expect(partnerPairs).toEqual([{ id: "rel-partner", a: "dad", b: "mom" }]);
  });

  it("pins the partition when two recorded couples share one child (bio + adoptive)", () => {
    const { families, partnerPairs } = deriveFamilies([
      partner("a", "b", "rel-ab"),
      partner("c", "d", "rel-cd"),
      parent("a", "kid1"),
      parent("b", "kid1"),
      parent("c", "kid1"),
      parent("d", "kid1"),
    ]);
    // The first couple in id-sorted order keeps the junction; the other pair's
    // members fall back to solo drops, and their partnership renders as a
    // plain dashed line.
    expect(families.map((family) => family.key).sort()).toEqual(["couple:a|b", "solo:c", "solo:d"]);
    for (const family of families) expect(family.children).toEqual(["kid1"]);
    expect(partnerPairs).toEqual([{ id: "rel-cd", a: "c", b: "d" }]);
  });
});

describe("buildConnectorEdges", () => {
  it("renders a couple family as one union couple edge plus one family edge", () => {
    const edges = buildConnectorEdges(coupleNodes(), coupleEdgesInput());
    const couple = couples(edges);
    const family = familyEdges(edges);
    expect(couple).toHaveLength(1);
    expect(family).toHaveLength(1);
    expect(couple[0]?.data?.variant).toBe("union");
    // Junction dot at the midpoint of the gap between the cards, at mid-height.
    expect(couple[0]?.data?.dotX).toBe(NODE_WIDTH + GAP / 2);
    expect(couple[0]?.data?.dotY).toBe(NODE_HEIGHT / 2);
    // Family path: stem from the junction, bus above the children, one drop each.
    const busY = 200 - BUS_OFFSET;
    expect(family[0]?.data?.path).toBe(
      `M ${NODE_WIDTH + GAP / 2},${NODE_HEIGHT / 2} V ${busY}` +
        ` M ${NODE_WIDTH / 2},${busY} H ${NODE_WIDTH + GAP + NODE_WIDTH / 2}` +
        ` M ${NODE_WIDTH / 2},${busY} V 200 M ${NODE_WIDTH + GAP + NODE_WIDTH / 2},${busY} V 200`,
    );
  });

  it("uses the partner relationship id for the couple edge and stable family ids", () => {
    const edges = buildConnectorEdges(coupleNodes(), coupleEdgesInput());
    expect(couples(edges)[0]?.id).toBe("rel-partner");
    expect(familyEdges(edges)[0]?.id).toBe("fam:couple:dad|mom");
    // Reversed input order yields identical ids.
    const reversed = buildConnectorEdges(
      [...coupleNodes()].reverse(),
      [...coupleEdgesInput()].reverse(),
    );
    expect(couples(reversed)[0]?.id).toBe("rel-partner");
    expect(familyEdges(reversed)[0]?.id).toBe("fam:couple:dad|mom");
  });

  it("draws a single vertical line for a lone parent with one centered child", () => {
    const edges = buildConnectorEdges(
      [person("mom", 0, 0), person("kid1", 0, 200)],
      [parent("mom", "kid1")],
    );
    expect(couples(edges)).toHaveLength(0);
    const family = familyEdges(edges);
    expect(family).toHaveLength(1);
    expect(family[0]?.data?.path).toBe(`M ${NODE_WIDTH / 2},${NODE_HEIGHT} V 200`);
  });

  it("treats a second parent hidden by collapse as absent (solo rendering)", () => {
    // Visible subgraph only carries edges between visible nodes, so the input
    // simply lacks the hidden parent's edge.
    const edges = buildConnectorEdges(
      [person("mom", 0, 0), person("kid1", 100, 200)],
      [parent("mom", "kid1")],
    );
    expect(couples(edges)).toHaveLength(0);
    expect(familyEdges(edges)).toHaveLength(1);
  });

  it("keeps exactly one edge for the single-parent single-child smoke fixture shape", () => {
    const edges = buildConnectorEdges(
      [person("mom", 0, 0), person("kid1", 0, 200)],
      [parent("mom", "kid1")],
    );
    expect(edges).toHaveLength(1);
  });

  it("puts the cross-row junction at the lower partner's mid-height", () => {
    const lowerY = 300;
    const nodes = [
      person("mom", 0, 0),
      person("dad", NODE_WIDTH + GAP, lowerY),
      person("kid1", 100, 600),
    ];
    const edges = buildConnectorEdges(nodes, [
      partner("mom", "dad"),
      parent("mom", "kid1"),
      parent("dad", "kid1"),
    ]);
    const couple = couples(edges);
    expect(couple).toHaveLength(1);
    expect(couple[0]?.data?.dotY).toBe(lowerY + NODE_HEIGHT / 2);
    // Orthogonal step, no diagonals.
    expect(couple[0]?.data?.path).toMatch(/^M [\d.]+,[\d.]+ H [\d.]+ V [\d.]+ H [\d.]+$/);
  });

  it("nudges a non-adjacent couple's dot off intervening cards", () => {
    const otherX = 2 * (NODE_WIDTH + GAP); // card sitting near the couple's midpoint
    const nodes = [
      person("mom", 0, 0),
      person("other", otherX, 0),
      person("dad", 4 * (NODE_WIDTH + GAP), 0),
      person("kid1", otherX, 200),
    ];
    const edges = buildConnectorEdges(nodes, [
      partner("mom", "dad"),
      parent("mom", "kid1"),
      parent("dad", "kid1"),
    ]);
    const couple = couples(edges);
    expect(couple).toHaveLength(1);
    const dotX = couple[0]?.data?.dotX;
    if (dotX == null) throw new Error("expected a junction dot");
    // Dot must clear the intervening card's span…
    expect(dotX + 6 <= otherX || dotX - 6 >= otherX + NODE_WIDTH).toBe(true);
    // …and stay on the mid-height line between the partners.
    expect(couple[0]?.data?.dotY).toBe(NODE_HEIGHT / 2);
  });

  it("flips a couple to the dashed partner style when no shared children are visible", () => {
    const edges = buildConnectorEdges(
      [person("mom", 0, 0), person("dad", NODE_WIDTH + GAP, 0)],
      [partner("mom", "dad", "rel-partner")],
    );
    const couple = couples(edges);
    expect(couple).toHaveLength(1);
    expect(couple[0]?.data?.variant).toBe("partnerOnly");
    expect(couple[0]?.data?.dotX).toBeNull();
    expect(familyEdges(edges)).toHaveLength(0);
  });

  it("orders family edges before couple edges so dots paint over stems", () => {
    const edges = buildConnectorEdges(coupleNodes(), coupleEdgesInput());
    expect(edges.map((edge) => edge.type)).toEqual(["family", "couple"]);
  });

  it("marks every connector edge inert", () => {
    for (const edge of buildConnectorEdges(coupleNodes(), coupleEdgesInput())) {
      expect(edge.selectable).toBe(false);
      expect(edge.focusable).toBe(false);
      expect(edge.interactionWidth).toBe(0);
    }
  });

  it("keeps the dot between partners when the gap exceeds ADJACENT_GAP_MAX", () => {
    const farX = NODE_WIDTH + ADJACENT_GAP_MAX + 40;
    const edges = buildConnectorEdges(
      [person("mom", 0, 0), person("dad", farX, 0), person("kid1", 100, 200)],
      [parent("mom", "kid1"), parent("dad", "kid1")],
    );
    const couple = couples(edges);
    expect(couple).toHaveLength(1);
    const dotX = couple[0]?.data?.dotX;
    if (dotX == null) throw new Error("expected a junction dot");
    expect(dotX).toBeGreaterThan(NODE_WIDTH);
    expect(dotX).toBeLessThan(farX);
  });

  it("mirrors the cross-row connector when the lower partner is the left node", () => {
    const edges = buildConnectorEdges(
      [person("mom", 0, 300), person("dad", NODE_WIDTH + GAP, 0), person("kid1", 0, 600)],
      [partner("mom", "dad"), parent("mom", "kid1"), parent("dad", "kid1")],
    );
    const couple = couples(edges);
    expect(couple).toHaveLength(1);
    // Line leaves the lower-left card through its RIGHT edge at its mid-height.
    expect(couple[0]?.data?.path).toBe(
      `M ${NODE_WIDTH},${300 + NODE_HEIGHT / 2} H 210 V ${NODE_HEIGHT / 2} H ${NODE_WIDTH + GAP}`,
    );
    expect(couple[0]?.data?.dotY).toBe(300 + NODE_HEIGHT / 2);
  });

  it("routes around the outside when cross-row partners overlap horizontally", () => {
    const edges = buildConnectorEdges(
      [person("mom", 0, 0), person("dad", 0, 300), person("kid1", 0, 600)],
      [partner("mom", "dad"), parent("mom", "kid1"), parent("dad", "kid1")],
    );
    const couple = couples(edges);
    expect(couple).toHaveLength(1);
    // Elbow sits clear of both card spans (x 0..190), not doubled back inside.
    const jx = NODE_WIDTH + GAP / 2;
    expect(couple[0]?.data?.path).toBe(
      `M ${NODE_WIDTH},${300 + NODE_HEIGHT / 2} H ${jx} V ${NODE_HEIGHT / 2} H ${NODE_WIDTH}`,
    );
    expect(couple[0]?.data?.dotX).toBe(jx);
  });

  it("falls back to a below-row bracket when every dot probe is blocked", () => {
    const blockers = [200, 400, 600, 800].map((x, i) => person(`mid${i}`, x, 0));
    const edges = buildConnectorEdges(
      [person("mom", 0, 0), ...blockers, person("dad", 1000, 0), person("kid1", 405, 200)],
      [partner("mom", "dad"), parent("mom", "kid1"), parent("dad", "kid1")],
    );
    const couple = couples(edges);
    expect(couple).toHaveLength(1);
    // Bracket: down from each parent's bottom-center, joined below the row.
    const jy = NODE_HEIGHT + 24;
    expect(couple[0]?.data?.path).toBe(
      `M ${NODE_WIDTH / 2},${NODE_HEIGHT} V ${jy} H ${1000 + NODE_WIDTH / 2} V ${NODE_HEIGHT}`,
    );
    // Junction (and stem origin) sits below the row so the stem still descends.
    expect(couple[0]?.data?.dotY).toBe(jy);
    const family = familyEdges(edges);
    // Stem descends from the bracket junction (midpoint of the card centers).
    expect(family[0]?.data?.path).toContain(
      `M ${(NODE_WIDTH / 2 + 1000 + NODE_WIDTH / 2) / 2},${jy} V `,
    );
  });

  it("brackets the second couple when interleaved couples would share one line", () => {
    const nodes = [
      person("s1", 0, 0),
      person("s2", 230, 0),
      person("d1", 460, 0),
      person("d2", 690, 0),
      person("k1", 100, 200),
      person("k2", 400, 200),
    ];
    const edges = buildConnectorEdges(nodes, [
      partner("s1", "d1", "rel-s1d1"),
      partner("s2", "d2", "rel-s2d2"),
      parent("s1", "k1"),
      parent("d1", "k1"),
      parent("s2", "k2"),
      parent("d2", "k2"),
    ]);
    const couple = couples(edges);
    expect(couple).toHaveLength(2);
    const first = couple.find((edge) => edge.id === "rel-s1d1");
    const second = couple.find((edge) => edge.id === "rel-s2d2");
    // Leftmost couple keeps the mid-height line…
    expect(first?.data?.path).toBe(`M ${NODE_WIDTH},${NODE_HEIGHT / 2} H 460`);
    // …the overlapping couple drops to a bracket instead of drawing collinearly.
    expect(second?.data?.path).toBe(
      `M ${230 + NODE_WIDTH / 2},${NODE_HEIGHT} V ${NODE_HEIGHT + 24} H ${690 + NODE_WIDTH / 2} V ${NODE_HEIGHT}`,
    );
    expect(second?.data?.dotY).toBe(NODE_HEIGHT + 24);
  });

  it("staggers buses apart when two families' sibling lines would fuse", () => {
    // mom+dad -> k1,k2 plus a guardian of k2 only: without a stagger both
    // buses land at the same y and read as one family.
    const nodes = [
      person("mom", 10, 0),
      person("dad", 240, 0),
      person("step", 470, 0),
      person("k1", 0, 166),
      person("k2", 440, 166),
    ];
    const edges = buildConnectorEdges(nodes, [
      partner("mom", "dad"),
      parent("mom", "k1"),
      parent("dad", "k1"),
      parent("mom", "k2"),
      parent("dad", "k2"),
      parent("step", "k2"),
    ]);
    const family = familyEdges(edges);
    expect(family).toHaveLength(2);
    const coupleBus = family.find((edge) => edge.id === "fam:couple:dad|mom");
    const soloBus = family.find((edge) => edge.id === "fam:solo:step");
    expect(coupleBus?.data?.path).toContain(`,${166 - BUS_OFFSET} `);
    expect(soloBus?.data?.path).toContain(`,${166 - BUS_OFFSET - BUS_STAGGER} `);
  });

  it("puts the family whose drop sits inside another's span on the lowest bus", () => {
    // B's span [95,210] covers A's left drop at 195; A's span [195,695] does
    // not cover B's drop at 95. A must take the LOW bus so its drop never
    // crosses B's bus; the old leftmost-first order produced that crossing.
    const nodes = [
      person("b1", 0, 0),
      person("b2", 230, 0),
      person("a1", 460, 0),
      person("a2", 690, 0),
      person("k3", 0, 200), // child of B, drop 95
      person("k1", 100, 200), // child of A, drop 195
      person("k2", 600, 200), // child of A, drop 695
    ];
    const edges = buildConnectorEdges(nodes, [
      partner("b1", "b2"),
      partner("a1", "a2"),
      parent("b1", "k3"),
      parent("b2", "k3"),
      parent("a1", "k1"),
      parent("a2", "k1"),
      parent("a1", "k2"),
      parent("a2", "k2"),
    ]);
    const family = familyEdges(edges);
    const aBus = family.find((edge) => edge.id === "fam:couple:a1|a2");
    const bBus = family.find((edge) => edge.id === "fam:couple:b1|b2");
    // A low (level 0), B lifted above it (level 1).
    expect(aBus?.data?.path).toContain(`,${200 - BUS_OFFSET} `);
    expect(bBus?.data?.path).toContain(`,${200 - BUS_OFFSET - BUS_STAGGER} `);
  });
});
