import { getDb, people, personNames, places, relationships } from "@familyarchive/db";
import {
  isParentRelationshipType,
  isPartnerRelationshipType,
  type RelationshipType,
} from "@familyarchive/shared";
import { and, asc, eq, ilike, inArray, isNull, or } from "drizzle-orm";

export type PersonRow = typeof people.$inferSelect;
export type PersonNameRow = typeof personNames.$inferSelect;

/** Not-deleted people in a tree, optionally filtered by name, ordered by name. */
export async function listPeople(treeId: string, query?: string): Promise<PersonRow[]> {
  const conditions = [eq(people.treeId, treeId), isNull(people.deletedAt)];
  if (query) conditions.push(ilike(people.fullName, `%${query}%`));
  return getDb()
    .select()
    .from(people)
    .where(and(...conditions))
    .orderBy(asc(people.fullName));
}

export async function getPerson(treeId: string, personId: string): Promise<PersonRow | null> {
  const rows = await getDb()
    .select()
    .from(people)
    .where(and(eq(people.id, personId), eq(people.treeId, treeId), isNull(people.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPersonNames(personId: string): Promise<PersonNameRow[]> {
  return getDb()
    .select()
    .from(personNames)
    .where(eq(personNames.personId, personId))
    .orderBy(asc(personNames.createdAt));
}

export async function getPlaceName(placeId: string | null): Promise<string | null> {
  if (!placeId) return null;
  const rows = await getDb()
    .select({ displayName: places.displayName })
    .from(places)
    .where(eq(places.id, placeId))
    .limit(1);
  return rows[0]?.displayName ?? null;
}

export interface RelatedPerson {
  person: PersonRow;
  type: RelationshipType;
  relationshipId: string;
}

export interface RelationshipGraph {
  parents: RelatedPerson[];
  children: RelatedPerson[];
  partners: RelatedPerson[];
  /** Inferred: other children of this person's parents (PRD §13.2). */
  siblings: PersonRow[];
}

/** All relationship groups for one person; soft-deleted people are filtered out. */
export async function getRelationshipGraph(
  treeId: string,
  personId: string,
): Promise<RelationshipGraph> {
  const db = getDb();
  const edges = await db
    .select()
    .from(relationships)
    .where(
      and(
        eq(relationships.treeId, treeId),
        or(eq(relationships.fromPersonId, personId), eq(relationships.toPersonId, personId)),
      ),
    );

  const parentEdges = edges.filter(
    (e) => isParentRelationshipType(e.type) && e.toPersonId === personId,
  );
  const childEdges = edges.filter(
    (e) => isParentRelationshipType(e.type) && e.fromPersonId === personId,
  );
  const partnerEdges = edges.filter((e) => isPartnerRelationshipType(e.type));

  const parentIds = parentEdges.map((e) => e.fromPersonId);

  // Siblings: children of this person's parents, excluding the person.
  const siblingEdges =
    parentIds.length > 0
      ? await db
          .select()
          .from(relationships)
          .where(
            and(eq(relationships.treeId, treeId), inArray(relationships.fromPersonId, parentIds)),
          )
      : [];
  const siblingIds = [
    ...new Set(
      siblingEdges
        .filter((e) => isParentRelationshipType(e.type) && e.toPersonId !== personId)
        .map((e) => e.toPersonId),
    ),
  ];

  const relatedIds = [
    ...new Set([
      ...parentEdges.map((e) => e.fromPersonId),
      ...childEdges.map((e) => e.toPersonId),
      ...partnerEdges.map((e) => (e.fromPersonId === personId ? e.toPersonId : e.fromPersonId)),
      ...siblingIds,
    ]),
  ];
  const relatedPeople =
    relatedIds.length > 0
      ? await db
          .select()
          .from(people)
          .where(
            and(
              eq(people.treeId, treeId),
              inArray(people.id, relatedIds),
              isNull(people.deletedAt),
            ),
          )
      : [];
  const byId = new Map(relatedPeople.map((p) => [p.id, p]));

  const toRelated = (edge: (typeof edges)[number], otherId: string): RelatedPerson | null => {
    const person = byId.get(otherId);
    return person ? { person, type: edge.type, relationshipId: edge.id } : null;
  };

  return {
    parents: parentEdges
      .map((e) => toRelated(e, e.fromPersonId))
      .filter((x): x is RelatedPerson => x !== null),
    children: childEdges
      .map((e) => toRelated(e, e.toPersonId))
      .filter((x): x is RelatedPerson => x !== null),
    partners: partnerEdges
      .map((e) => toRelated(e, e.fromPersonId === personId ? e.toPersonId : e.fromPersonId))
      .filter((x): x is RelatedPerson => x !== null),
    siblings: siblingIds
      .map((id) => byId.get(id))
      .filter((p): p is PersonRow => p !== undefined)
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
  };
}

/** Find-or-create a place by display name within a tree; null for blank input. */
export async function resolvePlaceId(
  treeId: string,
  displayName: string | null,
): Promise<string | null> {
  const name = displayName?.trim();
  if (!name) return null;
  const db = getDb();
  const existing = await db
    .select({ id: places.id })
    .from(places)
    .where(and(eq(places.treeId, treeId), eq(places.displayName, name)))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const inserted = await db
    .insert(places)
    .values({ treeId, displayName: name })
    .returning({ id: places.id });
  return inserted[0]?.id ?? null;
}
