import { describe, expect, it } from "vitest";

import { buildGedcom } from "./export";
import { buildFamilies, type FamilyEdge } from "./generate";

const alive = (...ids: string[]) => new Set(ids);
const parent = (from: string, to: string, type = "biological_parent"): FamilyEdge => ({
  fromPersonId: from,
  toPersonId: to,
  type,
});

describe("buildFamilies", () => {
  it("puts a child's two parents in one family", () => {
    const families = buildFamilies([parent("a", "c"), parent("b", "c")], alive("a", "b", "c"));
    expect(families).toEqual([expect.objectContaining({ parentIds: ["a", "b"], childIds: ["c"] })]);
  });

  it("collapses duplicate parent edges instead of emitting the same person twice", () => {
    // The unique constraint is on (tree, from, to, type), so one person can hold
    // several parent edges to the same child. Undeduplicated this produced a
    // family of ["a","a"], exported as both HUSB and WIFE pointing at @I1@.
    const families = buildFamilies(
      [parent("a", "c", "biological_parent"), parent("a", "c", "step_parent")],
      alive("a", "c"),
    );
    expect(families).toHaveLength(1);
    expect(families[0]?.parentIds).toEqual(["a"]);
  });

  it("keeps each parent's own pedigree when a child has mixed parentage", () => {
    // A biological parent and an adoptive parent must not share one PEDI: the
    // aggregate value used to mark the whole family adopted, and re-import then
    // downgraded the biological link.
    const families = buildFamilies(
      [parent("bio", "c", "biological_parent"), parent("adopt", "c", "adoptive_parent")],
      alive("bio", "adopt", "c"),
    );
    const byParent = new Map(families.map((f) => [f.parentIds.join("|"), f]));
    expect(byParent.get("bio")?.childPedigree).toEqual({});
    expect(byParent.get("adopt")?.childPedigree).toEqual({ c: "adopted" });
  });

  it("keeps a shared pedigree on a family where both parents agree", () => {
    const families = buildFamilies(
      [parent("a", "c", "adoptive_parent"), parent("b", "c", "adoptive_parent")],
      alive("a", "b", "c"),
    );
    expect(families).toHaveLength(1);
    expect(families[0]?.parentIds).toEqual(["a", "b"]);
    expect(families[0]?.childPedigree).toEqual({ c: "adopted" });
  });

  it("skips edges pointing at people who are not alive in the export set", () => {
    const families = buildFamilies([parent("a", "gone"), parent("a", "c")], alive("a", "c"));
    expect(families.flatMap((f) => f.childIds)).toEqual(["c"]);
  });

  it("gives partner pairs without children their own family record", () => {
    const families = buildFamilies(
      [{ fromPersonId: "a", toPersonId: "b", type: "spouse" }],
      alive("a", "b"),
    );
    expect(families).toEqual([
      expect.objectContaining({ parentIds: ["a", "b"], childIds: [], kind: "spouse" }),
    ]);
  });
});

describe("buildFamilies + buildGedcom", () => {
  it("never emits the same individual as both HUSB and WIFE", () => {
    const families = buildFamilies(
      [parent("a", "c", "biological_parent"), parent("a", "c", "unknown_parent")],
      alive("a", "c"),
    );
    const out = buildGedcom({
      individuals: [
        {
          id: "a",
          fullName: "Arthur Ashford",
          alternateNames: [],
          gender: "male",
          birth: null,
          death: null,
          notes: [],
        },
        {
          id: "c",
          fullName: "Rose Ashford",
          alternateNames: [],
          gender: "female",
          birth: null,
          death: null,
          notes: [],
        },
      ],
      families,
    });
    const husb = out.match(/^1 HUSB (@\w+@)$/m)?.[1];
    const wife = out.match(/^1 WIFE (@\w+@)$/m)?.[1];
    expect(husb).toBe("@I1@");
    expect(wife).toBeUndefined();
  });
});
