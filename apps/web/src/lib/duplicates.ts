import { getDb, people } from "@familyarchive/db";
import { and, eq, isNull, ne } from "drizzle-orm";

import type { PersonRow } from "@/lib/people";

/**
 * Simple duplicate heuristic (PRD §14.7): same normalized full name, and birth
 * years within 2 of each other or unknown on either side. Non-blocking —
 * surfaced as warnings and a review page; merge is out of scope for v1.
 */

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function birthYearsCompatible(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return true;
  return Math.abs(a - b) <= 2;
}

export interface DuplicatePair {
  a: PersonRow;
  b: PersonRow;
}

/** All potential duplicate pairs within a tree. */
export async function findDuplicatePairs(treeId: string): Promise<DuplicatePair[]> {
  const rows = await getDb()
    .select()
    .from(people)
    .where(and(eq(people.treeId, treeId), isNull(people.deletedAt)));

  const byName = new Map<string, PersonRow[]>();
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
): Promise<PersonRow[]> {
  const rows = await getDb()
    .select()
    .from(people)
    .where(
      and(eq(people.treeId, treeId), isNull(people.deletedAt), ne(people.id, excludePersonId)),
    );
  const target = normalizeName(fullName);
  return rows.filter(
    (person) =>
      normalizeName(person.fullName) === target &&
      birthYearsCompatible(person.birthYear, birthYear),
  );
}
