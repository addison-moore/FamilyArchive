import { describe, expect, it } from "vitest";

import { splitForCleanup } from "./ai-chunks";

describe("splitForCleanup", () => {
  it("leaves short text whole", () => {
    expect(splitForCleanup("--- Page 1 ---\nDear Ada,\n\nAll is well.")).toEqual([
      "--- Page 1 ---\nDear Ada,\n\nAll is well.",
    ]);
  });

  it("returns nothing for blank text", () => {
    expect(splitForCleanup("  \n\n ")).toEqual([]);
  });

  it("breaks on paragraphs and loses no words", () => {
    const paragraphs = Array.from({ length: 50 }, (_, i) => `paragraph ${i} ${"word ".repeat(30)}`);
    const chunks = splitForCleanup(paragraphs.join("\n\n"), 500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(500);
    const words = (value: string) => value.split(/\s+/).filter(Boolean);
    expect(words(chunks.join(" "))).toEqual(words(paragraphs.join(" ")));
  });

  it("cuts a paragraph longer than the limit at a word boundary", () => {
    const chunks = splitForCleanup("alpha ".repeat(400), 100);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
      expect(
        chunk
          .trim()
          .split(" ")
          .every((word) => word === "alpha"),
      ).toBe(true);
    }
  });

  it("hard-cuts text with no spaces at all", () => {
    const chunks = splitForCleanup("x".repeat(250), 100);
    expect(chunks.join("").length).toBe(250);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(100);
  });
});
