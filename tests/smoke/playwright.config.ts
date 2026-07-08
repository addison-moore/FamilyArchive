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
});
