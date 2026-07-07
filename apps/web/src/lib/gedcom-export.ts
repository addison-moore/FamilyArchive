import { getDb, people, personNames, places, relationships, trees } from "@familyarchive/db";
import { buildGedcom, type ExportFamily, type ExportIndividual } from "@familyarchive/gedcom";
import { isParentRelationshipType, isPartnerRelationshipType } from "@familyarchive/shared";
import { and, asc, eq, isNull } from "drizzle-orm";

/** Precedence when a parent pair has multiple partner-edge types (shouldn't normally happen). */
const KIND_RANK = { divorced_spouse: 4, spouse: 3, former_partner: 2, partner: 1 } as const;
type PartnerKind = keyof typeof KIND_RANK;

const PEDIGREE_BY_TYPE: Record<string, string> = {
  adoptive_parent: "adopted",
  foster_parent: "foster",
};

/**
 * Generate a GEDCOM file for a tree (PRD §14.5). FAM records are reconstructed
 * from the relationship graph: each child's parent set (max 2 per FAM) defines a
 * family; a third+ parent gets its own FAM; partner pairs without children get a
 * spouse-only FAM.
 */
export async function generateGedcom(
  treeId: string,
): Promise<{ fileName: string; content: string } | null> {
  const db = getDb();
  const treeRows = await db.select().from(trees).where(eq(trees.id, treeId)).limit(1);
  const tree = treeRows[0];
  if (!tree) return null;

  const [allPeople, allEdges, allPlaces, allNames] = await Promise.all([
    db
      .select()
      .from(people)
      .where(and(eq(people.treeId, treeId), isNull(people.deletedAt)))
      .orderBy(asc(people.createdAt)),
    db.select().from(relationships).where(eq(relationships.treeId, treeId)),
    db.select().from(places).where(eq(places.treeId, treeId)),
    db
      .select({ personId: personNames.personId, name: personNames.name })
      .from(personNames)
      .innerJoin(people, eq(personNames.personId, people.id))
      .where(and(eq(people.treeId, treeId), isNull(people.deletedAt))),
  ]);

  const alive = new Set(allPeople.map((p) => p.id));
  const placeName = new Map(allPlaces.map((p) => [p.id, p.displayName]));
  const altNames = new Map<string, string[]>();
  for (const row of allNames) {
    altNames.set(row.personId, [...(altNames.get(row.personId) ?? []), row.name]);
  }

  const individuals: ExportIndividual[] = allPeople.map((person) => ({
    id: person.id,
    fullName: person.fullName,
    alternateNames: altNames.get(person.id) ?? [],
    gender: person.gender,
    birth:
      person.birthYear !== null || person.birthPlaceId
        ? {
            date:
              person.birthYear !== null
                ? {
                    year: person.birthYear,
                    month: person.birthMonth,
                    day: person.birthDay,
                    approx: person.birthApprox,
                  }
                : null,
            place: person.birthPlaceId ? (placeName.get(person.birthPlaceId) ?? null) : null,
          }
        : null,
    death:
      person.deathYear !== null || person.deathPlaceId
        ? {
            date:
              person.deathYear !== null
                ? {
                    year: person.deathYear,
                    month: person.deathMonth,
                    day: person.deathDay,
                    approx: person.deathApprox,
                  }
                : null,
            place: person.deathPlaceId ? (placeName.get(person.deathPlaceId) ?? null) : null,
          }
        : null,
    notes: [person.biography, person.notes].filter((n): n is string => Boolean(n?.trim())),
  }));

  // Group each child's parents into families (max two parents per FAM).
  const parentsByChild = new Map<string, { parentId: string; type: string }[]>();
  const partnerKindByPair = new Map<string, PartnerKind>();
  for (const edge of allEdges) {
    if (!alive.has(edge.fromPersonId) || !alive.has(edge.toPersonId)) continue;
    if (isParentRelationshipType(edge.type)) {
      parentsByChild.set(edge.toPersonId, [
        ...(parentsByChild.get(edge.toPersonId) ?? []),
        { parentId: edge.fromPersonId, type: edge.type },
      ]);
    } else if (isPartnerRelationshipType(edge.type)) {
      const key = [edge.fromPersonId, edge.toPersonId].sort().join("|");
      const kind = edge.type as PartnerKind;
      const existing = partnerKindByPair.get(key);
      if (!existing || KIND_RANK[kind] > KIND_RANK[existing]) {
        partnerKindByPair.set(key, kind);
      }
    }
  }

  const familyByKey = new Map<string, ExportFamily>();
  const addChildToFamily = (parentIds: string[], childId: string, pedigree?: string) => {
    const key = [...parentIds].sort().join("|");
    let family = familyByKey.get(key);
    if (!family) {
      family = {
        parentIds: [...parentIds].sort(),
        childIds: [],
        kind: partnerKindByPair.get(key) ?? null,
        childPedigree: {},
      };
      familyByKey.set(key, family);
    }
    if (!family.childIds.includes(childId)) family.childIds.push(childId);
    if (pedigree) family.childPedigree![childId] = pedigree;
  };

  for (const [childId, parentLinks] of parentsByChild) {
    const pedigree = parentLinks
      .map((link) => PEDIGREE_BY_TYPE[link.type])
      .find((p): p is string => Boolean(p));
    if (parentLinks.length <= 2) {
      addChildToFamily(
        parentLinks.map((l) => l.parentId),
        childId,
        pedigree,
      );
    } else {
      // 3+ parents (step/foster constellations): pair up partnered parents,
      // remaining parents get single-parent FAMs.
      const remaining = new Set(parentLinks.map((l) => l.parentId));
      for (const a of [...remaining]) {
        if (!remaining.has(a)) continue;
        const partner = [...remaining].find(
          (b) => b !== a && partnerKindByPair.has([a, b].sort().join("|")),
        );
        if (partner) {
          remaining.delete(a);
          remaining.delete(partner);
          addChildToFamily([a, partner], childId, pedigree);
        }
      }
      for (const single of remaining) {
        const link = parentLinks.find((l) => l.parentId === single)!;
        addChildToFamily([single], childId, PEDIGREE_BY_TYPE[link.type]);
      }
    }
  }

  // Partner pairs without shared children still get a FAM record.
  for (const [key, kind] of partnerKindByPair) {
    if (!familyByKey.has(key)) {
      familyByKey.set(key, { parentIds: key.split("|"), childIds: [], kind, childPedigree: {} });
    }
  }

  const content = buildGedcom({
    individuals,
    families: [...familyByKey.values()],
    sourceName: `${tree.name}.ged`,
  });
  const fileName = `${tree.name.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "tree"}.ged`;
  return { fileName, content };
}
