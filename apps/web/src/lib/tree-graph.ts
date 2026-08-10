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

/** Adjacency the generation walk needs, independent of where the rows came from. */
export interface GraphAdjacency {
  /** child → parents */
  parentsOf: Map<string, string[]>;
  /** parent → children */
  childrenOf: Map<string, string[]>;
  partnersOf: Map<string, string[]>;
  exists: (personId: string) => boolean;
}

/**
 * Assign each reachable person a generation relative to the start (ancestors
 * negative, descendants positive). Pure, so the traversal rules are testable
 * without a database.
 *
 * Two roles are deliberately distinct. A person can be *included* as context —
 * a co-parent, a partner, a sibling — or *walked* as part of the descendant
 * frontier. Conflating them meant a person first met as a co-parent was already
 * recorded, so the later attempt to reach them as a real child was rejected,
 * they were never enqueued, and their entire subtree vanished from the canvas
 * while carrying the wrong generation.
 */
export function computeGenerations(
  graph: GraphAdjacency,
  startPersonId: string,
  mode: TreeViewMode,
): Map<string, number> {
  const { parentsOf, childrenOf, partnersOf, exists } = graph;
  const generationOf = new Map<string, number>([[startPersonId, 0]]);
  // Recorded only as context so far — their generation is a guess that a real
  // traversal is allowed to correct.
  const contextOnly = new Set<string>();

  const include = (personId: string, generation: number, asContext = false): boolean => {
    if (!exists(personId)) return false;
    if (generationOf.has(personId)) {
      // Someone first seen as context, now reached by a real walk: take the
      // true depth and let the walk continue through them.
      if (!asContext && contextOnly.has(personId)) {
        generationOf.set(personId, generation);
        contextOnly.delete(personId);
        return true;
      }
      return false;
    }
    generationOf.set(personId, generation);
    if (asContext) contextOnly.add(personId);
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
    // Separate from generationOf so a context hit cannot end the walk, and so a
    // person upgraded from context is still only ever enqueued once.
    const walked = new Set<string>([startPersonId]);
    let frontier = [startPersonId];
    for (let gen = 1; gen <= MAX_GENERATIONS && frontier.length > 0; gen++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const childId of childrenOf.get(id) ?? []) {
          include(childId, gen);
          if (exists(childId) && !walked.has(childId)) {
            walked.add(childId);
            next.push(childId);
          }
          for (const coParentId of parentsOf.get(childId) ?? []) {
            include(coParentId, gen - 1, true); // context only — no recursion
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
        include(childId, 0, true);
      }
    }
  }

  // Partners of everyone included (context only, same generation).
  for (const [id, generation] of [...generationOf]) {
    for (const partnerId of partnersOf.get(id) ?? []) {
      include(partnerId, generation, true);
    }
  }

  return generationOf;
}

/**
 * Build the visible graph around a starting person: ancestors,
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

  if (!peopleById.has(startPersonId)) {
    return { people: [], parentEdges: [], partnerEdges: [] };
  }
  const generationOf = computeGenerations(
    { parentsOf, childrenOf, partnersOf, exists: (id) => peopleById.has(id) },
    startPersonId,
    mode,
  );

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
 * The user's starting person for a tree: explicit preference when it
 * still points at a living row, else the earliest-created person, else null.
 */
export async function resolveStartingPerson(
  userId: string | null,
  treeId: string,
): Promise<PersonRow | null> {
  const db = getDb();
  const prefRows = userId
    ? await db
        .select({ startingPersonId: userTreePreferences.startingPersonId })
        .from(userTreePreferences)
        .where(and(eq(userTreePreferences.userId, userId), eq(userTreePreferences.treeId, treeId)))
        .limit(1)
    : [];
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
