import { expect, test, type Page } from "@playwright/test";

import { OWNER, samplePng } from "./helpers";

/**
 * Storage-quota checks (storage-quota plan). Opt-in: they need a FRESH stack
 * started with a tiny quota and a metrics token, e.g.
 *
 *   MEDIA_QUOTA_MB=1 METRICS_TOKEN=smoke-metrics-token-1 docker compose up -d
 *   QUOTA_SMOKE=1 BASE_URL=http://localhost:3100 pnpm test quota
 *
 * The default suite (`pnpm test:smoke`) skips them.
 */
const enabled = process.env.QUOTA_SMOKE === "1";
const METRICS_TOKEN = process.env.METRICS_TOKEN ?? "smoke-metrics-token-1";

test.describe.configure({ mode: "serial" });
test.skip(!enabled, "set QUOTA_SMOKE=1 (with a MEDIA_QUOTA_MB=1 stack) to run");

let page: Page;
let treeId: string;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});
test.afterAll(async () => {
  await page.close();
});

test("bootstrap owner and archive on the quota-limited stack", async () => {
  await page.goto("/register");
  await page.getByLabel("Name").fill(OWNER.name);
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel(/Password/).fill(OWNER.password);
  await page.getByRole("button", { name: "Create owner account" }).click();
  await page.waitForURL(/\/trees/);

  await page.goto("/trees/new");
  await page.getByLabel("Name").fill("Quota Test Archive");
  await page.getByRole("button", { name: "Create tree" }).click();
  await page.waitForURL(/\/trees\/[0-9a-f-]{36}/);
  treeId = page.url().match(/\/trees\/([0-9a-f-]{36})/)![1]!;
});

test("small upload succeeds and shows up in the usage endpoint", async () => {
  const response = await page.request.post(`/api/trees/${treeId}/media`, {
    headers: { "Content-Type": "image/png", "X-File-Name": "tiny.png" },
    data: samplePng(),
  });
  expect(response.status(), await response.text()).toBe(201);

  const usage = await page.request.get("/api/admin/usage", {
    headers: { Authorization: `Bearer ${METRICS_TOKEN}` },
  });
  expect(usage.status()).toBe(200);
  const body = (await usage.json()) as { quotaMb: number; usedBytes: number; mediaCount: number };
  expect(body.quotaMb).toBe(1);
  expect(body.usedBytes).toBeGreaterThan(0);
  expect(body.mediaCount).toBe(1);

  // Wrong/missing token is rejected.
  const unauthorized = await page.request.get("/api/admin/usage");
  expect(unauthorized.status()).toBe(401);
});

test("an upload past the cap is blocked with a friendly error", async () => {
  // 2 MB of random bytes against a 1 MB quota (random so dedup can't fire).
  const big = Buffer.alloc(2 * 1024 * 1024);
  for (let i = 0; i < big.length; i += 4) big.writeUInt32LE((Math.random() * 0xffffffff) >>> 0, i);
  const response = await page.request.post(`/api/trees/${treeId}/media`, {
    headers: { "Content-Type": "image/png", "X-File-Name": "too-big.png" },
    data: big,
  });
  expect(response.status()).toBe(413);
  const body = (await response.json()) as { error: string };
  expect(body.error).toContain("storage is full");
});

test("the settings page shows the storage meter", async () => {
  await page.goto(`/trees/${treeId}/settings`);
  await expect(page.getByRole("heading", { name: "Storage", exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Storage used" })).toBeVisible();
});
