import { getDb, people, personNames, places, relationships } from "@familyarchive/db";
import {
  dateSortKey,
  formatLifespan,
  isParentRelationshipType,
  isPartnerRelationshipType,
  type RelationshipType,
} from "@familyarchive/shared";
import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";

export type PersonRow = typeof people.$inferSelect;

/** A person's birth date as a number that sorts chronologically (see dateSortKey). */
export function personBirthSortKey(
  person: Pick<PersonRow, "birthYear" | "birthMonth" | "birthDay">,
): number | null {
  return dateSortKey({ year: person.birthYear, month: person.birthMonth, day: person.birthDay });
}

/** Escape LIKE wildcards in user input and match it anywhere in the value. */
export function likePattern(query: string): string {
  return `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
}

export const PERSON_OPTION_COLUMNS = {
  id: people.id,
  fullName: people.fullName,
  birthYear: people.birthYear,
  birthMonth: people.birthMonth,
  birthDay: people.birthDay,
  birthApprox: people.birthApprox,
  deathYear: people.deathYear,
  deathMonth: people.deathMonth,
  deathDay: people.deathDay,
  deathApprox: people.deathApprox,
};

export type PersonOption = Pick<PersonRow, keyof typeof PERSON_OPTION_COLUMNS>;

export function personLifespan(person: PersonOption): string | null {
  return formatLifespan(
    {
      year: person.birthYear,
      month: person.birthMonth,
      day: person.birthDay,
      approx: person.birthApprox,
    },
    {
      year: person.deathYear,
      month: person.deathMonth,
      day: person.deathDay,
      approx: person.deathApprox,
    },
  );
}

/** A person as the picker shows and submits them. Nothing else about them reaches the browser. */
export interface PersonChoice {
  id: string;
  fullName: string;
  lifespan: string | null;
}

function personChoice(person: PersonOption): PersonChoice {
  return { id: person.id, fullName: person.fullName, lifespan: personLifespan(person) };
}

/** One person for a picker that opens already showing them, such as a filter in the URL. */
export async function getPersonChoice(
  treeId: string,
  personId: string,
): Promise<PersonChoice | null> {
  const rows = await getDb()
    .select(PERSON_OPTION_COLUMNS)
    .from(people)
    .where(and(eq(people.id, personId), eq(people.treeId, treeId), isNull(people.deletedAt)))
    .limit(1);
  return rows[0] ? personChoice(rows[0]) : null;
}

export const PERSON_SEARCH_LIMIT = 20;
const MAX_SEARCH_LENGTH = 100;
const MAX_SEARCH_WORDS = 6;
const MAX_EXCLUDED_PEOPLE = 100;

/**
 * The words of a picker search, bounded because this is reachable by anyone on a
 * public archive. Control characters go too: Postgres rejects a NUL in a parameter,
 * so `?q=%00` would otherwise be a 500.
 */
export function personSearchWords(query: string): string[] {
  return (
    query
      .slice(0, MAX_SEARCH_LENGTH)
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, MAX_SEARCH_WORDS)
  );
}

/** Every word appears somewhere in `column`, in any order. */
function containsWords(column: AnyColumn, words: string[]): SQL {
  return and(...words.map((word) => ilike(column, likePattern(word))))!;
}

/**
 * Who a picker search can find: this archive's people, minus `excludeIds`, whose
 * full name or any one alternate name holds every word. Alternate names count
 * because archive search already finds people by them, and a married or maiden name
 * is often the one remembered.
 */
export function personSearchCondition(treeId: string, words: string[], excludeIds: string[]): SQL {
  const conditions: SQL[] = [eq(people.treeId, treeId), isNull(people.deletedAt)];
  const excluded = excludeIds
    .filter((id) => /^[\w-]{1,64}$/.test(id))
    .slice(0, MAX_EXCLUDED_PEOPLE);
  if (excluded.length > 0) conditions.push(notInArray(people.id, excluded));
  if (words.length > 0) {
    conditions.push(
      or(
        containsWords(people.fullName, words),
        sql`exists (select 1 from ${personNames} where ${and(
          eq(personNames.personId, people.id),
          containsWords(personNames.name, words),
        )})`,
      )!,
    );
  }
  return and(...conditions)!;
}

/**
 * Up to PERSON_SEARCH_LIMIT people for a picker; no words means the first by name.
 * Fetching one extra answers "are there more?" without a count on every keystroke.
 *
 * Names where every word starts a word sort first. With a cap, a plain alphabetical
 * sort lets twenty people called Ambrose hide everyone called Rose. People who share
 * a name read in birth order, which is how their lifespans tell them apart.
 */
export async function searchPersonChoices(
  treeId: string,
  query: string,
  excludeIds: string[] = [],
): Promise<{ people: PersonChoice[]; hasMore: boolean }> {
  const words = personSearchWords(query);
  const wordStarts = words.map(
    (word) => sql`(' ' || ${people.fullName}) ILIKE ${likePattern(` ${word}`)}`,
  );
  const rows = await getDb()
    .select(PERSON_OPTION_COLUMNS)
    .from(people)
    .where(personSearchCondition(treeId, words, excludeIds))
    .orderBy(
      ...(words.length > 0 ? [sql`CASE WHEN ${and(...wordStarts)} THEN 0 ELSE 1 END`] : []),
      asc(people.fullName),
      asc(people.birthYear),
      asc(people.id),
    )
    .limit(PERSON_SEARCH_LIMIT + 1);
  return {
    people: rows.slice(0, PERSON_SEARCH_LIMIT).map(personChoice),
    hasMore: rows.length > PERSON_SEARCH_LIMIT,
  };
}

/** Filters shared by the People list's count and page queries. */
interface PeopleFilter {
  /** Case-insensitive substring match on the full name. */
  query?: string;
  /** Restrict to a branch view's person ids; null/undefined means the whole tree. */
  ids?: Set<string> | null;
}

function peopleFilterConditions(treeId: string, filter: PeopleFilter): SQL[] {
  const conditions: SQL[] = [eq(people.treeId, treeId), isNull(people.deletedAt)];
  if (filter.query) conditions.push(ilike(people.fullName, likePattern(filter.query)));
  if (filter.ids) conditions.push(inArray(people.id, [...filter.ids]));
  return conditions;
}

/** How many people match — the total the pager pages through. */
export async function countPeople(treeId: string, filter: PeopleFilter = {}): Promise<number> {
  if (filter.ids?.size === 0) return 0;
  const rows = await getDb()
    .select({ value: count() })
    .from(people)
    .where(and(...peopleFilterConditions(treeId, filter)));
  return rows[0]?.value ?? 0;
}

/**
 * One page of matching people, ordered by name. Sorting breaks ties on id so
 * that a name shared by two people can't shuffle rows between pages.
 */
export async function listPeoplePage(
  treeId: string,
  filter: PeopleFilter,
  page: { limit: number; offset: number },
): Promise<PersonRow[]> {
  if (filter.ids?.size === 0) return [];
  return getDb()
    .select()
    .from(people)
    .where(and(...peopleFilterConditions(treeId, filter)))
    .orderBy(asc(people.fullName), asc(people.id))
    .limit(page.limit)
    .offset(page.offset);
}

export async function getPerson(treeId: string, personId: string): Promise<PersonRow | null> {
  const rows = await getDb()
    .select()
    .from(people)
    .where(and(eq(people.id, personId), eq(people.treeId, treeId), isNull(people.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPersonNames(personId: string) {
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
  /** A couple reads in the order their partnership was recorded. */
  parents: RelatedPerson[];
  /** Eldest first. */
  children: RelatedPerson[];
  /** In the order their families with this person started. */
  partners: RelatedPerson[];
  /** Inferred: other children of this person's parents, eldest first. */
  siblings: PersonRow[];
}

/** The parts of a relationship row that decide the order relatives read in. */
type FamilyEdge = Pick<typeof relationships.$inferSelect, "type" | "fromPersonId" | "toPersonId">;

/** Sorts eldest first, with people whose birth date is unknown after everyone else. */
const birthOrder = (person: PersonRow) => personBirthSortKey(person) ?? Number.MAX_SAFE_INTEGER;

/**
 * Puts one person's relatives in the order the tree canvas shows them. Pure, so
 * the rules are testable without a database.
 *
 * Children and siblings sit eldest first with the undated last and ties in
 * creation order, so `creationOrder` must hold everyone related in that order, as
 * buildTreeGraph's people are. Parents and partners follow the canvas's other
 * rules: a couple reads the way their partnership was recorded, and a remarried
 * person's partners read in the order their families started, by each one's
 * eldest child with this person. Anyone these rules leave tied keeps the order
 * given.
 *
 * The canvas can still differ where its layout outranks these rules: it seats an
 * in-law outside their partner and a remarried parent between partners, keeps
 * each of a remarried parent's families together, and moves a sibling beside a
 * partner who also has parents in view.
 *
 * `familyEdges` are the rows around the immediate relatives: those from the
 * parents, and those to the children.
 */
export function orderRelatives(
  { parents, children, partners, siblings }: RelationshipGraph,
  creationOrder: PersonRow[],
  familyEdges: FamilyEdge[],
): RelationshipGraph {
  const eldestFirst = [...creationOrder].sort((a, b) => birthOrder(a) - birthOrder(b));
  const birthRank = new Map(eldestFirst.map((person, rank) => [person.id, rank]));

  const parentIds = new Set(parents.map((r) => r.person.id));
  const firstOfCouple = new Set(
    familyEdges
      .filter(
        (e) =>
          isPartnerRelationshipType(e.type) &&
          parentIds.has(e.fromPersonId) &&
          parentIds.has(e.toPersonId),
      )
      .map((e) => e.fromPersonId),
  );
  const coupleOrder = (r: RelatedPerson) => (firstOfCouple.has(r.person.id) ? 0 : 1);

  const childIds = new Set(children.map((r) => r.person.id));
  const familyStart = new Map<string, number>();
  for (const e of familyEdges) {
    if (!isParentRelationshipType(e.type) || !childIds.has(e.toPersonId)) continue;
    const rank = birthRank.get(e.toPersonId)!;
    familyStart.set(e.fromPersonId, Math.min(rank, familyStart.get(e.fromPersonId) ?? rank));
  }
  const familyOrder = (r: RelatedPerson) => familyStart.get(r.person.id) ?? Number.MAX_SAFE_INTEGER;

  return {
    parents: [...parents].sort((a, b) => coupleOrder(a) - coupleOrder(b)),
    children: [...children].sort(
      (a, b) => birthRank.get(a.person.id)! - birthRank.get(b.person.id)!,
    ),
    partners: [...partners].sort((a, b) => familyOrder(a) - familyOrder(b)),
    siblings: [...siblings].sort((a, b) => birthRank.get(a.id)! - birthRank.get(b.id)!),
  };
}

/**
 * All relationship groups for one person; soft-deleted people are filtered out.
 * Rows are ordered by creation time and then id, as in buildTreeGraph (a GEDCOM
 * import creates everything in one transaction), so the groups read the same on
 * every load.
 */
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
    )
    .orderBy(asc(relationships.createdAt), asc(relationships.id));

  const parentEdges = edges.filter(
    (e) => isParentRelationshipType(e.type) && e.toPersonId === personId,
  );
  const childEdges = edges.filter(
    (e) => isParentRelationshipType(e.type) && e.fromPersonId === personId,
  );
  const partnerEdges = edges.filter((e) => isPartnerRelationshipType(e.type));

  const parentIds = parentEdges.map((e) => e.fromPersonId);
  const childIds = childEdges.map((e) => e.toPersonId);

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

  // The children's other parents, only needed to put two or more partners in order.
  const coParentEdges =
    partnerEdges.length > 1 && childIds.length > 0
      ? await db
          .select()
          .from(relationships)
          .where(and(eq(relationships.treeId, treeId), inArray(relationships.toPersonId, childIds)))
      : [];

  const relatedIds = [
    ...new Set([
      ...parentIds,
      ...childIds,
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
          .orderBy(asc(people.createdAt), asc(people.id))
      : [];
  const byId = new Map(relatedPeople.map((p) => [p.id, p]));

  const toRelated = (edge: (typeof edges)[number], otherId: string): RelatedPerson | null => {
    const person = byId.get(otherId);
    return person ? { person, type: edge.type, relationshipId: edge.id } : null;
  };

  return orderRelatives(
    {
      parents: parentEdges
        .map((e) => toRelated(e, e.fromPersonId))
        .filter((x): x is RelatedPerson => x !== null),
      children: childEdges
        .map((e) => toRelated(e, e.toPersonId))
        .filter((x): x is RelatedPerson => x !== null),
      partners: partnerEdges
        .map((e) => toRelated(e, e.fromPersonId === personId ? e.toPersonId : e.fromPersonId))
        .filter((x): x is RelatedPerson => x !== null),
      siblings: siblingIds.map((id) => byId.get(id)).filter((p): p is PersonRow => p !== undefined),
    },
    relatedPeople,
    [...siblingEdges, ...coParentEdges],
  );
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
