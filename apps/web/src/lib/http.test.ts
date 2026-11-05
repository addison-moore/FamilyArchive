import { describe, expect, it } from "vitest";

import { parseByteRange, safeRedirectPath } from "./http";

describe("safeRedirectPath", () => {
  it("keeps same-origin paths, query strings included", () => {
    expect(safeRedirectPath("/trees/abc?selected=1", "/")).toBe("/trees/abc?selected=1");
  });

  it.each([
    ["an absolute URL", "https://evil.test/"],
    ["a protocol-relative URL", "//evil.test/"],
    ["a backslash browsers read as a slash", "/\\evil.test/"],
    ["a tab browsers strip", "/\t/evil.test/"],
    ["a newline browsers strip", "/\n/evil.test/"],
    ["an empty value", ""],
  ])("refuses %s", (_label, value) => {
    expect(safeRedirectPath(value, "/fallback")).toBe("/fallback");
  });
});

describe("parseByteRange", () => {
  it("reads open and closed ranges", () => {
    expect(parseByteRange("bytes=0-")).toEqual({ start: 0, end: undefined });
    expect(parseByteRange("bytes=100-199")).toEqual({ start: 100, end: 199 });
  });

  it("ignores a range that ends before it starts", () => {
    expect(parseByteRange("bytes=100-50")).toBeUndefined();
  });

  it("ignores forms it does not serve", () => {
    expect(parseByteRange(null)).toBeUndefined();
    expect(parseByteRange("bytes=-500")).toBeUndefined();
    expect(parseByteRange("bytes=0-1,5-6")).toBeUndefined();
    expect(parseByteRange("items=0-1")).toBeUndefined();
  });
});
