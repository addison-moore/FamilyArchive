/**
 * Family-unit derivation shared by the layout (union nodes fed to dagre) and
 * the connector renderer (junction + stem + bus geometry). Pure and
 * import-free so both can depend on it.
 */

/** Minimal edge shape both callers can supply (CanvasEdge is compatible). */
export interface FamilyEdgeInput {
  id: string;
  source: string;
  target: string;
  kind: "parent" | "partner";
}

export interface FamilyUnit {
  /** `couple:a|b` (ids sorted) or `solo:parent` — stable across re-layouts. */
  key: string;
  /** Couples are sorted by id. */
  parents: [string] | [string, string];
  children: string[];
  /** Relationship id of a partner edge between the couple, if one exists. */
  partnerEdgeId: string | null;
}

export interface DerivedConnectors {
  families: FamilyUnit[];
  /** Partner pairs with no shared visible children — plain dashed lines. */
  partnerPairs: { id: string; a: string; b: string }[];
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Group children into family units by their visible parent set. Two parents
 * form a couple whether or not a partnership is recorded (the graph includes
 * partnerless co-parents); with three or more recorded parents, the pair
 * joined by a partner edge keeps the couple junction and every other parent
 * contributes its own solo drop.
 */
export function deriveFamilies(edges: FamilyEdgeInput[]): DerivedConnectors {
  // Several relationship rows between one pair (spouse + former_partner,
  // biological_parent + guardian) must not draw twice.
  const partnerIdByPair = new Map<string, string>();
  for (const edge of edges) {
    if (edge.kind !== "partner") continue;
    const key = pairKey(edge.source, edge.target);
    if (!partnerIdByPair.has(key)) partnerIdByPair.set(key, edge.id);
  }

  const seenParentPairs = new Set<string>();
  const parentsOf = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind !== "parent") continue;
    const dupeKey = `${edge.source}>${edge.target}`;
    if (seenParentPairs.has(dupeKey)) continue;
    seenParentPairs.add(dupeKey);
    const list = parentsOf.get(edge.target);
    if (list) list.push(edge.source);
    else parentsOf.set(edge.target, [edge.source]);
  }

  const families = new Map<string, FamilyUnit>();
  const addChild = (parents: FamilyUnit["parents"], child: string) => {
    const key = parents.length === 2 ? `couple:${parents[0]}|${parents[1]}` : `solo:${parents[0]}`;
    let family = families.get(key);
    if (!family) {
      family = {
        key,
        parents,
        children: [],
        partnerEdgeId:
          parents.length === 2
            ? (partnerIdByPair.get(pairKey(parents[0], parents[1])) ?? null)
            : null,
      };
      families.set(key, family);
    }
    family.children.push(child);
  };

  for (const [child, parents] of parentsOf) {
    const sorted = [...parents].sort();
    const [first, second] = sorted;
    if (!first) continue;
    if (sorted.length <= 2) {
      addChild(second === undefined ? [first] : [first, second], child);
      continue;
    }
    let couple: [string, string] | null = null;
    outer: for (const a of sorted) {
      for (const b of sorted) {
        if (a >= b) continue;
        if (partnerIdByPair.has(pairKey(a, b))) {
          couple = [a, b];
          break outer;
        }
      }
    }
    if (couple) {
      addChild(couple, child);
      for (const parent of sorted) {
        if (parent !== couple[0] && parent !== couple[1]) addChild([parent], child);
      }
    } else {
      for (const parent of sorted) addChild([parent], child);
    }
  }

  // A pair whose couple family exists is drawn by that family's connector.
  const partnerPairs: DerivedConnectors["partnerPairs"] = [];
  for (const [key, id] of partnerIdByPair) {
    if (families.has(`couple:${key}`)) continue;
    const [a, b] = key.split("|");
    if (a === undefined || b === undefined) continue;
    partnerPairs.push({ id, a, b });
  }

  return { families: [...families.values()], partnerPairs };
}
