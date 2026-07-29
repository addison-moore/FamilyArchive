import { expect, test, type Page } from "@playwright/test";

import { createArchive, login, OWNER, SAMPLE_GEDCOM } from "./helpers";

/**
 * Import-into-existing-archive and person merge (PRD §10, §14). The manual
 * "Wilhelmina Fairweather" collides with the GEDCOM's, so the import flags a
 * duplicate pair and the merge consolidates it. All data fictional (§1.5).
 */
test.describe.configure({ mode: "serial" });

let page: Page;
let treeId: string;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await login(page, OWNER.email, OWNER.password);
  treeId = await createArchive(page, "Merge Lab Archive");
});

test.afterAll(async () => {
  await page.close();
});

test("GEDCOM import into an EXISTING archive flags duplicates", async () => {
  await page.goto(`/trees/${treeId}/people/new`);
  await page.getByLabel("Full name").fill("Wilhelmina Fairweather");
  await page.locator('input[name="birthYear"]').fill("1901");
  await page.getByRole("button", { name: "Add person" }).click();
  await page.waitForURL(/\/people\/[0-9a-f-]{36}/);

  await page.goto("/trees/import");
  await page.locator('input[name="file"]').setInputFiles({
    name: "fairweather.ged",
    mimeType: "text/plain",
    buffer: Buffer.from(SAMPLE_GEDCOM, "utf-8"),
  });
  await page.locator('select[name="target"]').selectOption(treeId);
  await page.getByRole("button", { name: "Import" }).click();
  await page.waitForURL(new RegExp(`/trees/${treeId}\\?imported=1`));
  await expect(page.getByText(/GEDCOM import complete: 3 people/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Review possible duplicates" })).toBeVisible();
});

test("duplicates page surfaces the overlapping pair", async () => {
  await page.goto(`/trees/${treeId}/duplicates`);
  await expect(page.getByRole("heading", { name: "Possible duplicates" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Wilhelmina Fairweather/ })).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Compare & merge" })).toBeVisible();
});

test("merging consolidates the pair and retires the duplicate", async () => {
  await page.goto(`/trees/${treeId}/duplicates`);
  await page.getByRole("link", { name: "Compare & merge" }).click();
  await page.waitForURL(/\/merge\//);

  await expect(page.getByRole("heading", { name: "Merge people" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Carried over automatically" })).toBeVisible();
  await page.locator('input[name="confirm"]').fill("MERGE");
  await page.getByRole("button", { name: /^Merge .* into / }).click();
  await page.waitForURL(/merged=1/);
  await expect(page.getByText(/Merge complete — relationships, media tags/)).toBeVisible();

  // The survivor holds the imported family regardless of merge direction.
  await expect(page.getByRole("link", { name: /Bartholomew Fairweather/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Clementine Fairweather/ }).first()).toBeVisible();

  await page.goto(`/trees/${treeId}/people?scope=all`);
  await expect(page.getByRole("link", { name: /Wilhelmina Fairweather/ })).toHaveCount(1);

  await page.goto(`/trees/${treeId}/duplicates`);
  await expect(page.getByText("No possible duplicates found.")).toBeVisible();
});

test("GEDCOM export download reflects the merged archive", async () => {
  const response = await page.request.get(`/api/trees/${treeId}/gedcom`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  expect(response.headers()["content-disposition"]).toContain("attachment");

  const gedcom = await response.text();
  expect(gedcom).toContain("0 HEAD");
  expect(gedcom.trimEnd().endsWith("0 TRLR")).toBe(true);
  // Three living people after the merge; the merged-away record is excluded.
  expect(gedcom.match(/^0 @I\d+@ INDI$/gm)).toHaveLength(3);
  expect(gedcom.match(/Wilhelmina/g)).toHaveLength(1);
  expect(gedcom).toContain("Bartholomew");
});
