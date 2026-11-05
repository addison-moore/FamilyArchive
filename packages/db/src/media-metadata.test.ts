import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { mergeMediaMetadata } from "./media-metadata";

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
