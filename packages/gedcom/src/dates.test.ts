import { describe, expect, it } from "vitest";

import { formatGedcomDate, parseGedcomDate } from "./dates";

describe("parseGedcomDate", () => {
  it("parses exact day/month/year dates", () => {
    expect(parseGedcomDate("12 JAN 1888")).toEqual({
      year: 1888,
      month: 1,
      day: 12,
      approx: false,
    });
  });

  it("parses month/year and year-only forms, including 3-digit years", () => {
    expect(parseGedcomDate("JUN 1912")).toEqual({ year: 1912, month: 6, day: null, approx: false });
    expect(parseGedcomDate("987")).toEqual({ year: 987, month: null, day: null, approx: false });
  });

  it("marks qualified dates approximate", () => {
    expect(parseGedcomDate("ABT 1850")).toEqual({
      year: 1850,
      month: null,
      day: null,
      approx: true,
    });
    expect(parseGedcomDate("BEF JUN 1912")).toEqual({
      year: 1912,
      month: 6,
      day: null,
      approx: true,
    });
    expect(parseGedcomDate("BET 1900 AND 1905")).toEqual({
      year: 1900,
      month: null,
      day: null,
      approx: true,
    });
  });

  it("recognizes every qualifier spelling, with and without a trailing dot", () => {
    for (const raw of ["EST 1850", "CAL 1850", "ABOUT 1850", "abt. 1850", "ABT. 1850"]) {
      expect(parseGedcomDate(raw), raw).toEqual({
        year: 1850,
        month: null,
        day: null,
        approx: true,
      });
    }
    for (const raw of ["AFT 1850", "AFTER 1850", "BEFORE 1850", "bef. 1850"]) {
      expect(parseGedcomDate(raw), raw).toEqual({
        year: 1850,
        month: null,
        day: null,
        approx: true,
      });
    }
  });

  it("collapses every approximate form to ABT on the way back out (documented asymmetry)", () => {
    for (const raw of ["EST 1850", "BEF 1850", "AFT 1850", "BET 1850 AND 1860"]) {
      const parts = parseGedcomDate(raw)!;
      expect(formatGedcomDate(parts), raw).toBe("ABT 1850");
    }
  });

  it("salvages a 4-digit year from unrecognized phrases", () => {
    expect(parseGedcomDate("2ND QUARTER 1854")).toEqual({
      year: 1854,
      month: null,
      day: null,
      approx: true,
    });
  });

  it("returns null when no year is present", () => {
    expect(parseGedcomDate("UNKNOWN")).toBeNull();
  });

  it("keeps month and day on dual-dated years (1750/51)", () => {
    // Pre-1752 English records carry the Julian and Gregorian year together.
    // The shape match used to fail, degrading these to an approximate year.
    expect(parseGedcomDate("1 JAN 1750/51")).toEqual({
      year: 1750,
      month: 1,
      day: 1,
      approx: false,
    });
    expect(parseGedcomDate("1750/51")).toEqual({
      year: 1750,
      month: null,
      day: null,
      approx: false,
    });
    expect(parseGedcomDate("ABT MAR 1699/1700")).toEqual({
      year: 1699,
      month: 3,
      day: null,
      approx: true,
    });
  });

  it("handles FROM/TO periods like BET/AND", () => {
    expect(parseGedcomDate("FROM 1901 TO 1905")).toEqual({
      year: 1901,
      month: null,
      day: null,
      approx: true,
    });
    expect(parseGedcomDate("FROM JUN 1912")).toEqual({
      year: 1912,
      month: 6,
      day: null,
      approx: true,
    });
    expect(parseGedcomDate("TO 1905")).toEqual({
      year: 1905,
      month: null,
      day: null,
      approx: true,
    });
  });

  it("refuses BC dates rather than storing them as AD", () => {
    for (const raw of ["1000 B.C.", "500 BC", "44 BCE", "AD 1000 BC"]) {
      expect(parseGedcomDate(raw), raw).toBeNull();
    }
  });
});

describe("formatGedcomDate", () => {
  it("formats full, partial, approximate, and year-less parts", () => {
    expect(formatGedcomDate({ year: 1888, month: 1, day: 12, approx: false })).toBe("12 JAN 1888");
    expect(formatGedcomDate({ year: 1912, month: 6, day: null, approx: false })).toBe("JUN 1912");
    expect(formatGedcomDate({ year: 1850, month: null, day: null, approx: true })).toBe("ABT 1850");
    expect(formatGedcomDate({ year: null, month: null, day: null, approx: false })).toBeNull();
  });

  it("round-trips an exact date through parseGedcomDate", () => {
    const parts = { year: 1923, month: 11, day: 3, approx: false };
    expect(parseGedcomDate(formatGedcomDate(parts)!)).toEqual(parts);
  });
});
