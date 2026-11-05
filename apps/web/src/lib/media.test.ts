import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { branchMediaCondition } from "./media";

const render = (ids: string[]) => new PgDialect().sqlToQuery(branchMediaCondition(new Set(ids)));

describe("branchMediaCondition", () => {
  it("is one parenthesized group, so its `or` cannot escape a surrounding `and`", () => {
    // The same mistake once leaked collections across archives through search.
    for (const { sql } of [render(["a", "b"]), render([])]) {
      expect(sql.startsWith("(")).toBe(true);
      expect(sql.endsWith(")")).toBe(true);
    }
  });

  it("matches nothing tagged when the branch is empty", () => {
    const { sql, params } = render([]);
    expect(sql).toContain("or (false)");
    expect(params).toEqual([]);
  });

  it("binds each person id as a parameter", () => {
    expect(render(["a", "b"]).params).toEqual(["a", "b", "a", "b"]);
  });
});
