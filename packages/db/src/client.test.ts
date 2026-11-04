import { describe, expect, it, vi } from "vitest";

/** A fresh module instance, which is what `next dev` gives each compiled route. */
async function loadGetDb() {
  vi.resetModules();
  const { getDb } = await import("./client");
  return getDb;
}

describe("getDb", () => {
  it("shares one client across module instances", async () => {
    // No query runs here, so nothing ever connects to this address.
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:1/test");
    vi.stubEnv("AUTH_SECRET", "0123456789abcdef0123456789abcdef");

    const first = (await loadGetDb())();
    const second = (await loadGetDb())();

    // Compared as a boolean: a failing toBe would diff two whole Drizzle
    // clients, which runs the Vitest worker out of heap.
    expect(second === first).toBe(true);
  });
});
