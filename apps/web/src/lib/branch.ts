import { getDb, people, relationships, userTreePreferences } from "@familyarchive/db";
import { isParentRelationshipType, isPartnerRelationshipType } from "@familyarchive/shared";
import { and, eq, isNull } from "drizzle-orm";

import { resolveStartingPerson } from "@/lib/tree-graph";

export type ViewScope = "branch" | "all";

/**
 * "My branch" (PRD §10.6): blood kin of the anchor plus partners as context.
 * ancestors(anchor) → all descendants of ({anchor} ∪ ancestors) → partners of
 * the included people. Traversal never continues through a partner, so in-law
 * branches stay out. A browsing convenience only — never a privacy boundary.
 */
export async function branchPersonIds(treeId: string, anchorId: string): Promise<Set<string>> {
  const db = getDb();
  const [allPeople, allEdges] = await Promise.all([
    db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.treeId, treeId), isNull(people.deletedAt))),
    db.select().from(relationships).where(eq(relationships.treeId, treeId)),
  ]);
  const alive = new Set(allPeople.map((p) => p.id));

  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const partnersOf = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };
  for (const edge of allEdges) {
    if (!alive.has(edge.fromPersonId) || !alive.has(edge.toPersonId)) continue;
    if (isParentRelationshipType(edge.type)) {
      push(parentsOf, edge.toPersonId, edge.fromPersonId);
      push(childrenOf, edge.fromPersonId, edge.toPersonId);
    } else if (isPartnerRelationshipType(edge.type)) {
      push(partnersOf, edge.fromPersonId, edge.toPersonId);
      push(partnersOf, edge.toPersonId, edge.fromPersonId);
    }
  }

  if (!alive.has(anchorId)) return new Set();

  // 1. Ancestors of the anchor.
  const ancestors = new Set<string>();
  let frontier = [anchorId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const parentId of parentsOf.get(id) ?? []) {
        if (!ancestors.has(parentId)) {
          ancestors.add(parentId);
          next.push(parentId);
        }
      }
    }
    frontier = next;
  }

  // 2. Blood kin: descendants of the anchor and every ancestor.
  const blood = new Set<string>([anchorId, ...ancestors]);
  frontier = [...blood];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const childId of childrenOf.get(id) ?? []) {
        if (!blood.has(childId)) {
          blood.add(childId);
          next.push(childId);
        }
      }
    }
    frontier = next;
  }

  // 3. Partners of blood kin — one hop, no further traversal.
  const result = new Set(blood);
  for (const id of blood) {
    for (const partnerId of partnersOf.get(id) ?? []) {
      result.add(partnerId);
    }
  }
  return result;
}

export interface ResolvedView {
  scope: ViewScope;
  /** null in "all" scope or when the user has no anchor person. */
  branchIds: Set<string> | null;
  anchorName: string | null;
}

/**
 * Resolve the effective view for a user: explicit URL param wins, else the
 * stored preference; "branch" needs an anchor (starting person) to mean
 * anything, otherwise it degrades to "all".
 */
export async function resolveView(
  userId: string | null,
  treeId: string,
  scopeParam: string | undefined,
): Promise<ResolvedView> {
  // Anonymous public visitors have no anchor or preference — Everyone scope.
  if (!userId) return { scope: "all", branchIds: null, anchorName: null };
  const prefRows = await getDb()
    .select({ viewScope: userTreePreferences.viewScope })
    .from(userTreePreferences)
    .where(and(eq(userTreePreferences.userId, userId), eq(userTreePreferences.treeId, treeId)))
    .limit(1);
  const stored: ViewScope = prefRows[0]?.viewScope === "all" ? "all" : "branch";
  const scope: ViewScope = scopeParam === "all" || scopeParam === "branch" ? scopeParam : stored;

  if (scope === "all") return { scope, branchIds: null, anchorName: null };

  const anchor = await resolveStartingPerson(userId, treeId);
  if (!anchor) return { scope: "all", branchIds: null, anchorName: null };
  return {
    scope: "branch",
    branchIds: await branchPersonIds(treeId, anchor.id),
    anchorName: anchor.fullName,
  };
}
