import { describe, expect, it } from "vitest";

import { computeGenerations, type GraphAdjacency } from "./tree-graph";

/** Build adjacency from "parent>child" and "a=b" (partner) edge shorthand. */
function graph(...edges: string[]): GraphAdjacency {
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const partnersOf = new Map<string, string[]>();
  const everyone = new Set<string>();
  const push = (map: Map<string, string[]>, key: string, value: string) => {
    map.set(key, [...(map.get(key) ?? []), value]);
  };
  for (const edge of edges) {
    const [a, b] = edge.split(/[>=]/) as [string, string];
    everyone.add(a).add(b);
    if (edge.includes(">")) {
      push(parentsOf, b, a);
      push(childrenOf, a, b);
    } else {
      push(partnersOf, a, b);
      push(partnersOf, b, a);
    }
  }
  return { parentsOf, childrenOf, partnersOf, exists: (id) => everyone.has(id) };
}

describe("computeGenerations", () => {
  it("places ancestors above and descendants below the start", () => {
    const gens = computeGenerations(graph("gran>mum", "mum>me", "me>kid"), "me", "both");
    expect(gens.get("gran")).toBe(-2);
    expect(gens.get("mum")).toBe(-1);
    expect(gens.get("me")).toBe(0);
    expect(gens.get("kid")).toBe(1);
  });

  it("keeps walking a descendant first met as a co-parent", () => {
    // "partner" is reached as kidA's co-parent (context) before the walk reaches
    // them as start's own child. The context hit used to consume them, so their
    // subtree — grandkid — silently disappeared from the canvas.
    const gens = computeGenerations(
      graph("me>kidA", "me>partner", "partner>kidA", "partner>grandkid"),
      "me",
      "descendants",
    );
    expect(gens.has("grandkid")).toBe(true);
    expect(gens.get("partner")).toBe(1);
    expect(gens.get("grandkid")).toBe(2);
  });

  it("does not let context assignments override a real traversal depth", () => {
    const gens = computeGenerations(graph("me>a", "a>b", "me>b"), "me", "descendants");
    // b is both a direct child and a grandchild; the walk reaches it as a child.
    expect(gens.get("b")).toBe(1);
  });

  it("terminates on a parent cycle instead of hanging", () => {
    const gens = computeGenerations(graph("a>b", "b>c", "c>a"), "a", "both");
    expect([...gens.keys()].sort()).toEqual(["a", "b", "c"]);
  });

  it("includes partners and siblings as same-generation context", () => {
    const gens = computeGenerations(graph("dad>me", "dad>sis", "me=spouse"), "me", "both");
    expect(gens.get("sis")).toBe(0);
    expect(gens.get("spouse")).toBe(0);
  });

  it("honours ancestors-only and descendants-only modes", () => {
    const g = graph("gran>me", "me>kid");
    expect(computeGenerations(g, "me", "ancestors").has("kid")).toBe(false);
    expect(computeGenerations(g, "me", "descendants").has("gran")).toBe(false);
  });

  it("ignores edges to people who are not in the tree", () => {
    const g = graph("me>kid");
    g.parentsOf.set("kid", ["ghost"]);
    const gens = computeGenerations(g, "me", "both");
    expect(gens.has("ghost")).toBe(false);
  });
});
