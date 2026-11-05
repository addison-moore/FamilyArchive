import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { likePattern, personSearchCondition, personSearchWords } from "./people";

describe("personSearchWords", () => {
  it("splits on any whitespace and ignores what's around the words", () => {
    expect(personSearchWords("  rose   mary\tashford ")).toEqual(["rose", "mary", "ashford"]);
    expect(personSearchWords("   ")).toEqual([]);
  });

  it("drops control characters, which Postgres would reject in a parameter", () => {
    expect(personSearchWords("ro\u0000se")).toEqual(["ro", "se"]);
    expect(personSearchWords("\u0000")).toEqual([]);
  });

  it("is bounded, because anyone can reach it on a public archive", () => {
    expect(personSearchWords("a b c d e f g h")).toHaveLength(6);
    expect(personSearchWords("x".repeat(5000)).join("")).toHaveLength(100);
  });
});

describe("likePattern", () => {
  it("treats wildcards in the input as text", () => {
    expect(likePattern("100%")).toBe("%100\\%%");
    expect(likePattern("a_b")).toBe("%a\\_b%");
    expect(likePattern("a\\b")).toBe("%a\\\\b%");
  });
});

describe("personSearchCondition", () => {
  const render = (words: string[], excludeIds: string[] = []) =>
    new PgDialect().sqlToQuery(personSearchCondition("tree-1", words, excludeIds));

  it("keeps the name match inside the archive scope", () => {
    // `and()` parenthesizes the group it builds but not its members, so an `or` left bare
    // here would let its alternate-name branch find people in every archive on the
    // instance. See collectionYearCondition in search.ts for the time that happened.
    const { sql, params } = render(["rose"]);
    expect(sql).toMatch(
      /^\("people"\."tree_id" = \$1 and "people"\."deleted_at" is null and \(.* or exists \(.*\)\)\)$/,
    );
    expect(params[0]).toBe("tree-1");
  });

  it("requires every word, in the same name", () => {
    const { sql, params } = render(["rose", "ash"]);
    expect(params).toEqual(["tree-1", "%rose%", "%ash%", "%rose%", "%ash%"]);
    expect(sql.match(/"people"\."full_name" ilike/g)).toHaveLength(2);
    expect(sql.match(/"person_names"\."name" ilike/g)).toHaveLength(2);
  });

  it("escapes wildcards in the words", () => {
    expect(render(["100%"]).params).toContain("%100\\%%");
  });

  it("with no words, returns the whole archive in scope", () => {
    const { sql, params } = render([]);
    expect(sql).toBe('("people"."tree_id" = $1 and "people"."deleted_at" is null)');
    expect(params).toEqual(["tree-1"]);
  });

  it("leaves out excluded people, ignoring anything that isn't an id", () => {
    const id = "6f1c7a52-8f7e-4f8e-9a54-0d3a1c2b4e6f";
    const { sql, params } = render([], [id, "not an id!", "\u0000"]);
    expect(sql).toContain('"people"."id" not in ($2)');
    expect(params).toEqual(["tree-1", id]);
  });

  it("caps how many people can be excluded", () => {
    const ids = Array.from({ length: 150 }, (_, i) => `id-${i}`);
    expect(render([], ids).params).toHaveLength(1 + 100);
  });
});
