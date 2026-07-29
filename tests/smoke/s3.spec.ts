import { createHash } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { createArchive, OWNER, samplePng, uploadMedia } from "./helpers";

/**
 * S3 storage-driver checks (PRD §24.3). Opt-in: they need a FRESH stack
 * running on the MinIO-backed override:
 *
 *   docker compose down -v
 *   docker compose -f compose.yaml -f docker/docker-compose.s3.yml --profile minio up -d --build
 *   S3_SMOKE=1 pnpm --filter @familyarchive/smoke-tests exec playwright test --project=s3
 *
 * The default suite (`pnpm test:smoke`) skips them.
 */
const enabled = process.env.S3_SMOKE === "1";

test.describe.configure({ mode: "serial" });
test.skip(!enabled, "set S3_SMOKE=1 (with the s3 compose override stack) to run");

let page: Page;
let treeId: string;
let photoId: string;
const png = samplePng();

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});

test.afterAll(async () => {
  await page.close();
});

test("bootstrap owner and archive on the S3-backed stack", async () => {
  await page.goto("/register");
  await page.getByLabel("Name").fill(OWNER.name);
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel(/Password/).fill(OWNER.password);
  await page.getByRole("button", { name: "Create owner account" }).click();
  await page.waitForURL(/\/trees/);
  treeId = await createArchive(page, "S3 Smoke Archive");
});

test("an uploaded original round-trips through the S3 driver byte-for-byte", async () => {
  photoId = await uploadMedia(page, treeId, "s3-photo.png", "image/png", png);
  const original = await page.request.get(`/api/trees/${treeId}/media/${photoId}/original`);
  expect(original.status()).toBe(200);
  const body = await original.body();
  const digest = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");
  expect(digest(body)).toBe(digest(png));
});

test("the worker reads and writes derivatives through S3", async () => {
  test.setTimeout(240_000);
  const deadline = Date.now() + 120_000;
  let derivativeSrc: string | null = null;
  while (Date.now() < deadline && !derivativeSrc) {
    await page.goto(`/trees/${treeId}/media?scope=all`);
    derivativeSrc = await page
      .locator('img[src*="/derivatives/"]')
      .first()
      .getAttribute("src")
      .catch(() => null);
    if (!derivativeSrc) await page.waitForTimeout(3_000);
  }
  expect(derivativeSrc, "no derivative thumbnail appeared on the S3 stack").toBeTruthy();
  const derivative = await page.request.get(derivativeSrc!);
  expect(derivative.status()).toBe(200);
  expect(derivative.headers()["content-type"]).toContain("image/");
});

test("range requests are honored via the S3 ContentRange path", async () => {
  const ranged = await page.request.get(`/api/trees/${treeId}/media/${photoId}/original`, {
    headers: { Range: "bytes=0-7" },
  });
  expect(ranged.status()).toBe(206);
  expect(ranged.headers()["content-range"]).toMatch(/^bytes 0-7\/\d+$/);
  const body = await ranged.body();
  expect(body).toHaveLength(8);
  expect([...body.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
});
