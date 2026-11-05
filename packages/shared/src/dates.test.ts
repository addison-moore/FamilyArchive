import { describe, expect, it } from "vitest";

import {
  dateSortKey,
  formatDateParts,
  formatLifespan,
  validateDateParts,
  type DateParts,
} from "./dates";

function parts(year: number | null, month: number | null = null, day: number | null = null) {
  return { year, month, day, approx: false };
}

const UNKNOWN: DateParts = parts(null);

describe("validateDateParts", () => {
  it("requires each finer part to have the coarser ones", () => {
    expect(validateDateParts({ ...parts(null, 5), approx: false })).toBe("A month requires a year");
    expect(validateDateParts({ ...parts(1900, null, 3), approx: false })).toBe(
      "A day requires a month",
    );
  });

  it("checks ranges", () => {
    expect(validateDateParts(parts(0))).toBe("Year must be between 1 and 9999");
    expect(validateDateParts(parts(10_000))).toBe("Year must be between 1 and 9999");
    expect(validateDateParts(parts(1900, 13))).toBe("Month must be between 1 and 12");
    expect(validateDateParts(parts(1900, 12, 32))).toBe(
      "Day must be between 1 and 31 for that month",
    );
    expect(validateDateParts(parts(1900, 2, 30))).toBe(
      "Day must be between 1 and 29 for that month",
    );
    expect(validateDateParts(parts(1900, 4, 31))).toBe(
      "Day must be between 1 and 30 for that month",
    );
  });

  it("accepts unknown, partial, and full dates", () => {
    expect(validateDateParts(UNKNOWN)).toBeNull();
    expect(validateDateParts(parts(1892))).toBeNull();
    expect(validateDateParts(parts(1892, 5))).toBeNull();
    expect(validateDateParts(parts(1892, 5, 3))).toBeNull();
    expect(validateDateParts(parts(1892, 2, 29))).toBeNull();
  });
});

describe("formatDateParts", () => {
  it("formats full, partial, approximate, and unknown dates", () => {
    expect(formatDateParts(parts(1892, 5, 3))).toBe("May 3, 1892");
    expect(formatDateParts(parts(1892, 5))).toBe("May 1892");
    expect(formatDateParts(parts(1892))).toBe("1892");
    expect(formatDateParts({ ...parts(1892), approx: true })).toBe("abt. 1892");
    expect(formatDateParts(UNKNOWN)).toBeNull();
  });
});

describe("dateSortKey", () => {
  it("sorts by year, then month, then day, with unknown parts first", () => {
    const sorted = [
      parts(1920, 6, 2),
      parts(1919, 12, 31),
      parts(1920),
      parts(1920, 6),
      parts(1920, 1, 15),
    ].sort((a, b) => dateSortKey(a)! - dateSortKey(b)!);
    expect(sorted).toEqual([
      parts(1919, 12, 31),
      parts(1920),
      parts(1920, 1, 15),
      parts(1920, 6),
      parts(1920, 6, 2),
    ]);
  });

  it("has no key without a year, and ignores approximation", () => {
    expect(dateSortKey(UNKNOWN)).toBeNull();
    const approximate: DateParts = { ...parts(1892), approx: true };
    expect(dateSortKey(approximate)).toBe(dateSortKey(parts(1892)));
  });
});

describe("formatLifespan", () => {
  it("joins both dates, prefixes single ones, and is null when both unknown", () => {
    expect(formatLifespan(parts(1892), parts(1967))).toBe("1892 – 1967");
    expect(formatLifespan(parts(1892), UNKNOWN)).toBe("b. 1892");
    expect(formatLifespan(UNKNOWN, { ...parts(1967), approx: true })).toBe("d. abt. 1967");
    expect(formatLifespan(UNKNOWN, UNKNOWN)).toBeNull();
  });
});
