import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  pageCount,
  parsePageSize,
  resolvePageNumber,
} from "./pagination";

describe("parsePageSize", () => {
  it("accepts every offered size as a number or a URL string", () => {
    for (const size of PAGE_SIZES) {
      expect(parsePageSize(size)).toBe(size);
      expect(parsePageSize(String(size))).toBe(size);
    }
  });

  it("rejects sizes that are not on the menu, so a crafted URL cannot dump the tree", () => {
    expect(parsePageSize("10000")).toBeNull();
    expect(parsePageSize(51)).toBeNull();
    expect(parsePageSize("0")).toBeNull();
    expect(parsePageSize("-50")).toBeNull();
    expect(parsePageSize("50.5")).toBeNull();
    expect(parsePageSize("abc")).toBeNull();
    expect(parsePageSize("")).toBeNull();
    expect(parsePageSize(undefined)).toBeNull();
    expect(parsePageSize(null)).toBeNull();
  });

  it("offers the default size", () => {
    expect(PAGE_SIZES).toContain(DEFAULT_PAGE_SIZE);
  });
});

describe("pageCount", () => {
  it("counts partial pages and never returns zero", () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(1, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
    expect(pageCount(312, 50)).toBe(7);
    expect(pageCount(312, 200)).toBe(2);
  });
});

describe("resolvePageNumber", () => {
  it("clamps past-the-end pages back to the last one", () => {
    expect(resolvePageNumber("99", 7)).toBe(7);
    expect(resolvePageNumber("7", 7)).toBe(7);
    expect(resolvePageNumber(3, 7)).toBe(3);
  });

  it("falls back to page 1 for junk, and for an empty list", () => {
    expect(resolvePageNumber("0", 7)).toBe(1);
    expect(resolvePageNumber("-2", 7)).toBe(1);
    expect(resolvePageNumber("2.5", 7)).toBe(1);
    expect(resolvePageNumber("abc", 7)).toBe(1);
    expect(resolvePageNumber(undefined, 7)).toBe(1);
    expect(resolvePageNumber("3", 0)).toBe(1);
  });
});
