import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "./errors";

/**
 * The wrapped cases are the ones that matter. Drizzle does not rethrow the
 * driver's error — it wraps it and leaves the SQLSTATE on `cause` — so a
 * predicate that only inspects the thrown error looks correct in a unit test
 * and reports every real lost race as a 500. Verified against the running
 * stack: three concurrent uploads returned 500 until this walked the chain.
 */
describe("isUniqueViolation", () => {
  it("recognizes a driver error wrapped by drizzle", () => {
    const wrapped = new Error("Failed query: update media_items ...", {
      cause: Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
      }),
    });
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it("recognizes it several levels down, and survives a cyclic chain", () => {
    const inner = Object.assign(new Error("dup"), { code: "23505" });
    expect(isUniqueViolation(new Error("a", { cause: new Error("b", { cause: inner }) }))).toBe(
      true,
    );

    const loop = new Error("loop") as Error & { cause?: unknown };
    loop.cause = loop;
    expect(isUniqueViolation(loop)).toBe(false);
  });

  it("recognizes an unwrapped driver error", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("rejects other database errors, wrapped or not", () => {
    // 23503 is a foreign-key violation, 23502 a not-null violation: both are
    // real failures that must not be reported to the client as a conflict.
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(
      isUniqueViolation(new Error("x", { cause: Object.assign(new Error(), { code: "23502" }) })),
    ).toBe(false);
    expect(isUniqueViolation({ code: 23505 })).toBe(false);
  });

  it("rejects anything that is not a driver error", () => {
    for (const value of [null, undefined, "23505", 23505, new Error("23505"), {}]) {
      expect(isUniqueViolation(value), String(value)).toBe(false);
    }
  });
});
