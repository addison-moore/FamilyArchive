import { getDb, people } from "@familyarchive/db";
import { and, eq, isNull } from "drizzle-orm";

import { PERSON_OPTION_COLUMNS, type PersonOption } from "@/lib/people";

/**
 * Simple duplicate heuristic: same normalized full name, and birth
 * years within 2 of each other or unknown on either side. Non-blocking —
 * surfaced as warnings and a review page, from which an admin can merge the
 * pair manually (PRD §10.5).
 */

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function birthYearsCompatible(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return true;
  return Math.abs(a - b) <= 2;
}

interface DuplicatePair {
  a: PersonOption;
  b: PersonOption;
}

const peopleInTree = (treeId: string) =>
  getDb()
    .select(PERSON_OPTION_COLUMNS)
    .from(people)
    .where(and(eq(people.treeId, treeId), isNull(people.deletedAt)));

/** All potential duplicate pairs within a tree. */
export async function findDuplicatePairs(treeId: string): Promise<DuplicatePair[]> {
  const rows = await peopleInTree(treeId);

  const byName = new Map<string, PersonOption[]>();
  for (const person of rows) {
    const key = normalizeName(person.fullName);
    byName.set(key, [...(byName.get(key) ?? []), person]);
  }

  const pairs: DuplicatePair[] = [];
  for (const group of byName.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (birthYearsCompatible(group[i]!.birthYear, group[j]!.birthYear)) {
          pairs.push({ a: group[i]!, b: group[j]! });
        }
      }
    }
  }
  return pairs;
}

/** Existing people that look like the given name/birth-year (for post-create warnings). */
export async function findSimilarPeople(
  treeId: string,
  fullName: string,
  birthYear: number | null,
  excludePersonId: string,
): Promise<PersonOption[]> {
  const rows = await peopleInTree(treeId);
  const target = normalizeName(fullName);
  return rows.filter(
    (person) =>
      person.id !== excludePersonId &&
      normalizeName(person.fullName) === target &&
      birthYearsCompatible(person.birthYear, birthYear),
  );
}
