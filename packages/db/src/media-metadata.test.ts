import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { isPurgeStarted, mergeMediaMetadata } from "./media-metadata";

describe("isPurgeStarted", () => {
  it("is true once the purge section exists", () => {
    expect(isPurgeStarted({ purge: { startedAt: "2026-11-04T12:00:00.000Z" } })).toBe(true);
  });

  it("is false for other metadata and for anything that isn't an object", () => {
    for (const value of [{}, { ocr: { status: "done" } }, null, undefined, "purge"]) {
      expect(isPurgeStarted(value), String(value)).toBe(false);
    }
  });
});

describe("mergeMediaMetadata", () => {
  it("merges inside the statement, without reading the document first", () => {
    const { sql, params } = new PgDialect().sqlToQuery(
      mergeMediaMetadata("ocr", { status: "queued", error: null }),
    );
    expect(sql).toContain("jsonb_set(");
    expect(sql).toContain("||");
    expect(params).toEqual(["ocr", "ocr", JSON.stringify({ status: "queued", error: null })]);
  });
});
