import { describe, expect, it } from "vitest";

import { buildGedcom, type ExportIndividual } from "./export";
import { parseGedcom } from "./parse";

function person(
  id: string,
  fullName: string,
  gender = "unknown",
  extra: Partial<ExportIndividual> = {},
): ExportIndividual {
  return {
    id,
    fullName,
    alternateNames: [],
    gender,
    birth: null,
    death: null,
    notes: [],
    ...extra,
  };
}

function lines(text: string): string[] {
  return text.trimEnd().split("\n");
}

describe("buildGedcom", () => {
  it("emits a 5.5.1 header, trailer, and optional FILE line", () => {
    const out = lines(buildGedcom({ individuals: [], families: [], sourceName: "smoke.ged" }));
    expect(out[0]).toBe("0 HEAD");
    expect(out).toContain("2 VERS 5.5.1");
    expect(out).toContain("1 FILE smoke.ged");
    expect(out[out.length - 1]).toBe("0 TRLR");
  });

  it("slashes the last word as the surname; single names stay bare", () => {
    const out = buildGedcom({
      individuals: [person("a", "Mary de Silva"), person("b", "Cher")],
      families: [],
    });
    expect(out).toContain("1 NAME Mary de /Silva/");
    expect(out).toContain("1 NAME Cher");
  });

  it("maps genders to SEX values, with U for anything nonstandard", () => {
    const out = buildGedcom({
      individuals: [
        person("a", "A", "male"),
        person("b", "B", "female"),
        person("c", "C", "nonbinary"),
      ],
      families: [],
    });
    expect(lines(out).filter((l) => l.startsWith("1 SEX"))).toEqual([
      "1 SEX M",
      "1 SEX F",
      "1 SEX U",
    ]);
  });

  it("splits multi-line notes into CONT lines", () => {
    const out = lines(
      buildGedcom({
        individuals: [person("a", "A", "male", { notes: ["First line\nSecond line"] })],
        families: [],
      }),
    );
    const noteAt = out.indexOf("1 NOTE First line");
    expect(noteAt).toBeGreaterThan(-1);
    expect(out[noteAt + 1]).toBe("2 CONT Second line");
  });

  it("emits events with formatted dates and places, skipping empty events", () => {
    const out = buildGedcom({
      individuals: [
        person("a", "A", "male", {
          birth: { date: { year: 1888, month: 1, day: 12, approx: false }, place: "Springfield" },
          death: { date: { year: 1901, month: null, day: null, approx: true }, place: null },
        }),
        person("b", "B", "female", { birth: { date: null, place: null } }),
      ],
      families: [],
    });
    expect(out).toContain("2 DATE 12 JAN 1888");
    expect(out).toContain("2 PLAC Springfield");
    expect(out).toContain("2 DATE ABT 1901");
    expect(lines(out).filter((l) => l === "1 BIRT")).toHaveLength(1);
  });

  it("assigns HUSB by gender regardless of parent order", () => {
    const out = lines(
      buildGedcom({
        individuals: [person("mom", "Edith", "female"), person("dad", "Arthur", "male")],
        families: [{ parentIds: ["mom", "dad"], childIds: [], kind: "spouse" }],
      }),
    );
    expect(out).toContain("1 HUSB @I2@");
    expect(out).toContain("1 WIFE @I1@");
  });

  it("exports both parents of a two-mother family positionally", () => {
    const out = lines(
      buildGedcom({
        individuals: [person("a", "Ann", "female"), person("b", "Beth", "female")],
        families: [{ parentIds: ["a", "b"], childIds: [], kind: "partner" }],
      }),
    );
    expect(out).toContain("1 HUSB @I1@");
    expect(out).toContain("1 WIFE @I2@");
  });

  it("exports a single female parent as WIFE only", () => {
    const out = lines(
      buildGedcom({
        individuals: [person("a", "Ann", "female"), person("kid", "Kit", "unknown")],
        families: [{ parentIds: ["a"], childIds: ["kid"], kind: null }],
      }),
    );
    expect(out).toContain("1 WIFE @I1@");
    expect(out.some((l) => l.startsWith("1 HUSB"))).toBe(false);
  });

  it("marks MARR/DIV by relationship kind; partners get neither", () => {
    const build = (kind: "spouse" | "divorced_spouse" | "partner") =>
      lines(
        buildGedcom({
          individuals: [person("a", "A", "male"), person("b", "B", "female")],
          families: [{ parentIds: ["a", "b"], childIds: [], kind }],
        }),
      );
    expect(build("spouse")).toContain("1 MARR Y");
    expect(build("spouse")).not.toContain("1 DIV Y");
    expect(build("divorced_spouse")).toEqual(expect.arrayContaining(["1 MARR Y", "1 DIV Y"]));
    expect(build("partner").some((l) => l === "1 MARR Y" || l === "1 DIV Y")).toBe(false);
  });

  it("round-trips a family through parseGedcom", () => {
    const out = buildGedcom({
      individuals: [
        person("dad", "Arthur Ashford", "male", {
          birth: { date: { year: 1888, month: 1, day: 12, approx: false }, place: "Springfield" },
          notes: ["Kept the parish records\nfor forty years"],
        }),
        person("mom", "Edith Ashford", "female"),
        person("kid", "Rose Ashford", "female"),
      ],
      families: [
        {
          parentIds: ["dad", "mom"],
          childIds: ["kid"],
          kind: "spouse",
          childPedigree: { kid: "adopted" },
        },
      ],
    });

    const parsed = parseGedcom(out);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.individuals.map((i) => i.fullName)).toEqual([
      "Arthur Ashford",
      "Edith Ashford",
      "Rose Ashford",
    ]);
    expect(parsed.individuals[0]?.birth?.date).toEqual({
      year: 1888,
      month: 1,
      day: 12,
      approx: false,
    });
    expect(parsed.individuals[0]?.notes).toEqual(["Kept the parish records\nfor forty years"]);
    expect(parsed.families).toEqual([
      expect.objectContaining({
        husbandXref: "@I1@",
        wifeXref: "@I2@",
        childXrefs: ["@I3@"],
        married: true,
        divorced: false,
      }),
    ]);
    expect(parsed.individuals[2]?.childInFamilies).toEqual([
      { famXref: "@F1@", pedigree: "adopted" },
    ]);
  });
});

describe("GEDCOM value escaping and folding", () => {
  it("round-trips a literal @ through the @@ escape", () => {
    const note = "Wrote to archive@example.org about the parish records";
    const out = buildGedcom({
      individuals: [person("p1", "Arthur Ashford", "male", { notes: [note] })],
      families: [],
    });
    // Unescaped, the @ reads back as the start of an xref pointer.
    expect(out).toContain("archive@@example.org");
    expect(parseGedcom(out).individuals[0]?.notes).toEqual([note]);
  });

  it("keeps every physical line within the 255-character limit", () => {
    const longNote = "Ashford ".repeat(120).trim();
    const out = buildGedcom({
      individuals: [
        person("p1", "Arthur Ashford", "male", {
          notes: [longNote],
          birth: { date: null, place: "Little Wenlock, ".repeat(40).trim() },
        }),
      ],
      families: [],
    });
    for (const line of lines(out)) expect(line.length).toBeLessThanOrEqual(255);
    // Folding is lossless: CONC continuations rejoin on parse.
    const back = parseGedcom(out).individuals[0];
    expect(back?.notes).toEqual([longNote]);
    expect(back?.birth?.place).toBe("Little Wenlock, ".repeat(40).trim());
  });

  it("does not split an escaped @@ pair across a fold boundary", () => {
    // Land an "@" near the fold point so a naive split would break the pair.
    for (let pad = 230; pad < 260; pad++) {
      const note = `${"x".repeat(pad)}@tail`;
      const out = buildGedcom({
        individuals: [person("p1", "A B", "male", { notes: [note] })],
        families: [],
      });
      for (const line of lines(out)) expect(line.length).toBeLessThanOrEqual(255);
      expect(parseGedcom(out).individuals[0]?.notes, `pad=${pad}`).toEqual([note]);
    }
  });
});

describe("GEDCOM version reporting", () => {
  const withVersion = (version: string) =>
    parseGedcom(
      ["0 HEAD", "1 GEDC", `2 VERS ${version}`, "0 @I1@ INDI", "1 NAME A /B/", "0 TRLR"].join("\n"),
    ).warnings;

  it("stays quiet on the supported versions", () => {
    expect(withVersion("5.5.1")).toEqual([]);
    expect(withVersion("5.5")).toEqual([]);
  });

  it("warns on a version outside what the parser targets", () => {
    // GEDCOM 7 moves tags around; it still parses best-effort, but silently
    // producing a partial import is worse than saying so.
    expect(withVersion("7.0").join(" ")).toMatch(/7\.0.*outside the supported versions/);
  });
});

describe("parser pointer handling", () => {
  it("tolerates trailing whitespace after an xref pointer", () => {
    const text = [
      "0 HEAD",
      "1 CHAR UTF-8",
      "0 @I1@ INDI",
      "1 NAME Arthur /Ashford/",
      "0 @I2@ INDI",
      "1 NAME Rose /Ashford/",
      "0 @F1@ FAM",
      "1 HUSB @I1@ ",
      "1 CHIL @I2@  ",
      "0 TRLR",
    ].join("\n");
    const parsed = parseGedcom(text);
    expect(parsed.families[0]?.husbandXref).toBe("@I1@");
    expect(parsed.families[0]?.childXrefs).toEqual(["@I2@"]);
    // The reference resolves, so no "missing individual" warning is raised.
    expect(parsed.warnings).toEqual([]);
  });
});
