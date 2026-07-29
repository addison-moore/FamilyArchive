import { describe, expect, it } from "vitest";

import { parseGedcom } from "./parse";

function ged(...lines: string[]): string {
  return lines.join("\n");
}

describe("parseGedcom", () => {
  it("parses individuals with events through BOM and CRLF line endings", () => {
    const text =
      "\uFEFF" +
      [
        "0 HEAD",
        "1 SOUR Test",
        "0 @I1@ INDI",
        "1 NAME John /Smith/",
        "1 SEX M",
        "1 BIRT",
        "2 DATE 12 JAN 1888",
        "2 PLAC Springfield",
        "0 TRLR",
      ].join("\r\n");
    const result = parseGedcom(text);
    expect(result.warnings).toEqual([]);
    expect(result.header?.tag).toBe("HEAD");
    expect(result.individuals).toHaveLength(1);
    const person = result.individuals[0]!;
    expect(person.fullName).toBe("John Smith");
    expect(person.gender).toBe("male");
    expect(person.birth).toEqual({
      dateRaw: "12 JAN 1888",
      date: { year: 1888, month: 1, day: 12, approx: false },
      place: "Springfield",
    });
  });

  it("handles bare-CR line endings", () => {
    const result = parseGedcom("0 @I1@ INDI\r1 NAME Rose /Ashford/\r0 TRLR");
    expect(result.individuals[0]?.fullName).toBe("Rose Ashford");
  });

  it("cleans slash surnames and collapses whitespace; extra NAMEs become alternates", () => {
    const result = parseGedcom(
      ged("0 @I1@ INDI", "1 NAME Mary  /de la Cruz/", "1 NAME Mary /Ashford/"),
    );
    const person = result.individuals[0]!;
    expect(person.fullName).toBe("Mary de la Cruz");
    expect(person.alternateNames).toEqual(["Mary Ashford"]);
  });

  it("maps SEX values and defaults to unknown", () => {
    const result = parseGedcom(
      ged(
        "0 @I1@ INDI",
        "1 NAME A",
        "1 SEX F",
        "0 @I2@ INDI",
        "1 NAME B",
        "1 SEX X",
        "0 @I3@ INDI",
        "1 NAME C",
      ),
    );
    expect(result.individuals.map((i) => i.gender)).toEqual(["female", "unknown", "unknown"]);
  });

  it("folds CONT as newline and CONC as concatenation", () => {
    const result = parseGedcom(
      ged(
        "0 @I1@ INDI",
        "1 NAME A /B/",
        "1 NOTE First line",
        "2 CONT Second line",
        "2 CONC  continued",
      ),
    );
    expect(result.individuals[0]?.notes).toEqual(["First line\nSecond line continued"]);
  });

  it("dereferences NOTE xrefs and drops unresolvable ones", () => {
    const result = parseGedcom(
      ged(
        "0 @I1@ INDI",
        "1 NAME A /B/",
        "1 NOTE @N1@",
        "1 NOTE @N9@",
        "0 @N1@ NOTE Remembered fondly",
        "1 CONT by everyone",
      ),
    );
    expect(result.individuals[0]?.notes).toEqual(["Remembered fondly\nby everyone"]);
  });

  it("skips malformed and orphan lines with warnings instead of failing", () => {
    const result = parseGedcom(
      ged("1 NAME Floating", "0 @I1@ INDI", "1 NAME Real /Person/", "%%% garbage"),
    );
    expect(result.individuals).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes("orphan line 1"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("malformed line 4"))).toBe(true);
  });

  it("parses families with marriage, divorce, and child links", () => {
    const result = parseGedcom(
      ged(
        "0 @I1@ INDI",
        "1 NAME Arthur /Ashford/",
        "0 @I2@ INDI",
        "1 NAME Edith /Ashford/",
        "0 @I3@ INDI",
        "1 NAME Rose /Ashford/",
        "1 FAMC @F1@",
        "2 PEDI Adopted",
        "0 @F1@ FAM",
        "1 HUSB @I1@",
        "1 WIFE @I2@",
        "1 CHIL @I3@",
        "1 MARR",
        "1 DIV",
      ),
    );
    expect(result.families).toEqual([
      expect.objectContaining({
        xref: "@F1@",
        husbandXref: "@I1@",
        wifeXref: "@I2@",
        childXrefs: ["@I3@"],
        married: true,
        divorced: true,
      }),
    ]);
    expect(result.individuals[2]?.childInFamilies).toEqual([
      { famXref: "@F1@", pedigree: "adopted" },
    ]);
  });

  it("warns when a family references a missing individual", () => {
    const result = parseGedcom(
      ged("0 @I1@ INDI", "1 NAME A", "0 @F1@ FAM", "1 HUSB @I1@", "1 CHIL @I9@"),
    );
    expect(result.warnings.some((w) => w.includes("@F1@") && w.includes("@I9@"))).toBe(true);
  });

  it("warns when the file contains no individuals", () => {
    const result = parseGedcom("0 HEAD\n0 TRLR");
    expect(result.warnings.some((w) => w.includes("No individuals found"))).toBe(true);
  });
});
