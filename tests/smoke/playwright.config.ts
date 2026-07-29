import { defineConfig } from "@playwright/test";

/**
 * Smoke tests (PRD §32): run against a FRESH FamilyArchive instance —
 * owner bootstrap and invite-only registration mean a dirty database fails
 * the first step by design.
 *
 *   docker compose down -v && docker compose up -d --build
 *   pnpm test:smoke              # BASE_URL overrides the default target
 */
export default defineConfig({
  testDir: ".",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    screenshot: "only-on-failure",
  },
  reporter: [["list"]],
  // Ordering matters on a fresh stack: smoke.spec registers the instance
  // owner (first-account bootstrap), so everything else depends on "core".
  // `--project=permissions --no-deps` reruns just that spec on a used stack.
  projects: [
    { name: "core", testMatch: /smoke\.spec\.ts/ },
    { name: "permissions", testMatch: /permissions\.spec\.ts/, dependencies: ["core"] },
    { name: "features", testMatch: /features-.*\.spec\.ts/, dependencies: ["core"] },
    { name: "quota", testMatch: /quota\.spec\.ts/ },
    { name: "s3", testMatch: /s3\.spec\.ts/ },
  ],
});
