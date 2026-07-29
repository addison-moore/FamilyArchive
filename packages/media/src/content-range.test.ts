import { describe, expect, it } from "vitest";

import { parseContentRange } from "./content-range";

describe("parseContentRange", () => {
  it("parses a well-formed header", () => {
    expect(parseContentRange("bytes 0-499/1234")).toEqual({ start: 0, end: 499, total: 1234 });
    expect(parseContentRange("bytes 900-999/1000")).toEqual({ start: 900, end: 999, total: 1000 });
  });

  it("returns null for unsatisfied-range and malformed headers", () => {
    expect(parseContentRange("bytes */1234")).toBeNull();
    expect(parseContentRange("")).toBeNull();
    expect(parseContentRange("items 0-4/10")).toBeNull();
  });
});
