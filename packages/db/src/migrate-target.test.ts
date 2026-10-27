import { describe, expect, it } from "vitest";

import { describeTarget } from "./migrate-target";

describe("describeTarget", () => {
  it("never includes the password", () => {
    // This string is printed to a terminal and can reach CI logs or a pasted
    // bug report, so the credential must not survive the round trip.
    const target = describeTarget("postgres://dev:sup3r-s3cret@10.10.2.120:5432/familyarchive");
    expect(target.label).not.toContain("sup3r-s3cret");
    expect(target.label).toBe("dev@10.10.2.120:5432/familyarchive");
  });

  it("treats loopback and the compose service name as expected", () => {
    for (const host of ["localhost", "127.0.0.1", "postgres"]) {
      expect(describeTarget(`postgres://u:p@${host}:5432/db`).expected, host).toBe(true);
    }
  });

  it("treats anything else as needing confirmation", () => {
    // The case this guards: a .env left pointing at a shared dev host.
    expect(describeTarget("postgres://dev:p@10.10.2.120:5432/familyarchive").expected).toBe(false);
    expect(describeTarget("postgres://u:p@db.example.com:5432/prod").expected).toBe(false);
  });

  it("fills in the default port and reports a missing database", () => {
    expect(describeTarget("postgres://u:p@localhost/db").label).toBe("u@localhost:5432/db");
    expect(describeTarget("postgres://u:p@localhost:5432/").label).toBe(
      "u@localhost:5432/(default)",
    );
  });

  it("does not claim an unparseable URL is safe", () => {
    const target = describeTarget("not a url");
    expect(target.expected).toBe(false);
    expect(target.label).toBe("(unparseable DATABASE_URL)");
  });

  it("tolerates the doubled slash seen in some hand-written URLs", () => {
    // `.env` on one machine had postgres://…:5432//familyarchive.
    expect(describeTarget("postgres://u:p@localhost:5432//familyarchive").label).toBe(
      "u@localhost:5432/familyarchive",
    );
  });
});
