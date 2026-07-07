import { getDb, people, relationships, userTreePreferences } from "@familyarchive/db";
import { isParentRelationshipType, isPartnerRelationshipType } from "@familyarchive/shared";
import { and, asc, eq, isNull } from "drizzle-orm";

import type { PersonRow } from "@/lib/people";

export const TREE_VIEW_MODES = ["both", "ancestors", "descendants"] as const;
export type TreeViewMode = (typeof TREE_VIEW_MODES)[number];

export function isTreeViewMode(value: unknown): value is TreeViewMode {
  return typeof value === "string" && (TREE_VIEW_MODES as readonly string[]).includes(value);
}

/** Guard against pathological parent cycles; ~12 generations is beyond any real view. */
const MAX_GENERATIONS = 12;

export interface TreeGraph {
  /** Included people with their generation relative to the start (ancestors < 0). */
  people: { person: PersonRow; generation: number }[];
  /** parent → child edges among included people. */
  parentEdges: { id: string; fromPersonId: string; toPersonId: string }[];
  /** Symmetric partner edges among included people. */
  partnerEdges: { id: string; fromPersonId: string; toPersonId: string }[];
}

/**
 * Build the visible graph around a starting person (PRD §11.2): ancestors,
 * descendants, and non-recursive "immediate family context" — partners of
 * everyone shown, co-parents of included children, and the start's siblings.
 * Loads the whole tree's people/edges in two queries; family trees are small.
 */
export async function buildTreeGraph(
  treeId: string,
  startPersonId: string,
  mode: TreeViewMode,
): Promise<TreeGraph> {
  const db = getDb();
  const [allPeople, allEdges] = await Promise.all([
    db
      .select()
      .from(people)
      .where(and(eq(people.treeId, treeId), isNull(people.deletedAt))),
    db.select().from(relationships).where(eq(relationships.treeId, treeId)),
  ]);
  const peopleById = new Map(allPeople.map((p) => [p.id, p]));

  const parentsOf = new Map<string, string[]>(); // child -> parents
  const childrenOf = new Map<string, string[]>(); // parent -> children
  const partnersOf = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };
  for (const edge of allEdges) {
    if (!peopleById.has(edge.fromPersonId) || !peopleById.has(edge.toPersonId)) continue;
    if (isParentRelationshipType(edge.type)) {
      push(parentsOf, edge.toPersonId, edge.fromPersonId);
      push(childrenOf, edge.fromPersonId, edge.toPersonId);
    } else if (isPartnerRelationshipType(edge.type)) {
      push(partnersOf, edge.fromPersonId, edge.toPersonId);
      push(partnersOf, edge.toPersonId, edge.fromPersonId);
    }
  }

  const generationOf = new Map<string, number>();
  if (!peopleById.has(startPersonId)) {
    return { people: [], parentEdges: [], partnerEdges: [] };
  }
  generationOf.set(startPersonId, 0);

  const include = (personId: string, generation: number): boolean => {
    if (generationOf.has(personId) || !peopleById.has(personId)) return false;
    generationOf.set(personId, generation);
    return true;
  };

  // Ancestors: climb parent edges.
  if (mode !== "descendants") {
    let frontier = [startPersonId];
    for (let gen = -1; gen >= -MAX_GENERATIONS && frontier.length > 0; gen--) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const parentId of parentsOf.get(id) ?? []) {
          if (include(parentId, gen)) next.push(parentId);
        }
      }
      frontier = next;
    }
  }

  // Descendants: walk child edges; include co-parents of each child as context.
  if (mode !== "ancestors") {
    let frontier = [startPersonId];
    for (let gen = 1; gen <= MAX_GENERATIONS && frontier.length > 0; gen++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const childId of childrenOf.get(id) ?? []) {
          if (include(childId, gen)) next.push(childId);
          for (const coParentId of parentsOf.get(childId) ?? []) {
            include(coParentId, gen - 1); // context only — no recursion
          }
        }
      }
      frontier = next;
    }
  }

  // Start's siblings: other children of the start's parents (context only).
  if (mode === "both") {
    for (const parentId of parentsOf.get(startPersonId) ?? []) {
      for (const childId of childrenOf.get(parentId) ?? []) {
        include(childId, 0);
      }
    }
  }

  // Partners of everyone included (context only, same generation).
  for (const [id, generation] of [...generationOf]) {
    for (const partnerId of partnersOf.get(id) ?? []) {
      include(partnerId, generation);
    }
  }

  const included = [...generationOf.keys()];
  const includedSet = new Set(included);
  const parentEdges = allEdges.filter(
    (e) =>
      isParentRelationshipType(e.type) &&
      includedSet.has(e.fromPersonId) &&
      includedSet.has(e.toPersonId),
  );
  const partnerEdges = allEdges.filter(
    (e) =>
      isPartnerRelationshipType(e.type) &&
      includedSet.has(e.fromPersonId) &&
      includedSet.has(e.toPersonId),
  );

  return {
    people: included.map((id) => ({
      person: peopleById.get(id)!,
      generation: generationOf.get(id)!,
    })),
    parentEdges: parentEdges.map((e) => ({
      id: e.id,
      fromPersonId: e.fromPersonId,
      toPersonId: e.toPersonId,
    })),
    partnerEdges: partnerEdges.map((e) => ({
      id: e.id,
      fromPersonId: e.fromPersonId,
      toPersonId: e.toPersonId,
    })),
  };
}

/**
 * The user's starting person for a tree (PRD §7.5): explicit preference when it
 * still points at a living row, else the earliest-created person, else null.
 */
export async function resolveStartingPerson(
  userId: string,
  treeId: string,
): Promise<PersonRow | null> {
  const db = getDb();
  const prefRows = await db
    .select({ startingPersonId: userTreePreferences.startingPersonId })
    .from(userTreePreferences)
    .where(and(eq(userTreePreferences.userId, userId), eq(userTreePreferences.treeId, treeId)))
    .limit(1);
  const preferredId = prefRows[0]?.startingPersonId;
  if (preferredId) {
    const rows = await db
      .select()
      .from(people)
      .where(and(eq(people.id, preferredId), eq(people.treeId, treeId), isNull(people.deletedAt)))
      .limit(1);
    if (rows[0]) return rows[0];
  }
  const fallback = await db
    .select()
    .from(people)
    .where(and(eq(people.treeId, treeId), isNull(people.deletedAt)))
    .orderBy(asc(people.createdAt))
    .limit(1);
  return fallback[0] ?? null;
}
