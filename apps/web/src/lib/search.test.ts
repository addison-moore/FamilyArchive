import { collections } from "@familyarchive/db";
import { and, eq } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { collectionYearCondition } from "./search";

/**
 * Regression guard for a cross-archive leak. The year filter used to be a single
 * raw `sql` fragment whose own top level was an `or`. Drizzle's `and()`
 * parenthesizes the group it builds but not the members inside it, so the
 * fragment rendered as
 *
 *   (tree_id = $1 and (...) or start_year = $5 or end_year = $6)
 *
 * and — because `and` binds tighter than `or` — the trailing disjuncts escaped
 * the tree scope, returning collections from every archive on the instance.
 */

/** True when the whole expression is wrapped in one balanced paren group. */
function isSelfContained(sql: string): boolean {
  if (!sql.startsWith("(")) return false;
  let depth = 0;
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") {
      depth--;
      // The opening paren closed before the end, so the tail sits at top level.
      if (depth === 0) return i === sql.length - 1;
    }
  }
  return false;
}

describe("collectionYearCondition", () => {
  it("renders as a self-contained group, so it cannot escape an enclosing and()", () => {
    expect(isSelfContained(new PgDialect().sqlToQuery(collectionYearCondition(1900)).sql)).toBe(
      true,
    );
  });

  it("keeps every year disjunct under the tree scope", () => {
    const sql = new PgDialect().sqlToQuery(
      and(eq(collections.treeId, "tree-a"), collectionYearCondition(1900))!,
    ).sql;
    // No disjunct may sit between the tree_id term and the end of the statement:
    // every `or` has to be nested deeper than the top-level `and`.
    expect(sql).toMatch(/^\("collections"\."tree_id" = \$1 and \(.*\)\)$/s);
  });

  it("still matches a year inside the range and on either endpoint", () => {
    const sql = new PgDialect().sqlToQuery(collectionYearCondition(1900)).sql;
    expect(sql).toContain("between");
    expect(sql).toContain('"collections"."start_year" = ');
    expect(sql).toContain('"collections"."end_year" = ');
  });
});

describe("isSelfContained", () => {
  it("rejects the shape the old raw fragment produced", () => {
    expect(isSelfContained('(a and b) or "start_year" = $2')).toBe(false);
  });

  it("accepts a fully wrapped disjunction", () => {
    expect(isSelfContained('((a and b) or "start_year" = $2)')).toBe(true);
  });
});
