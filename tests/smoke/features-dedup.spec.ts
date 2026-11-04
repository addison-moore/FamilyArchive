import { expect, test, type Page } from "@playwright/test";

import { createArchive, login, OWNER, samplePng } from "./helpers";

/**
 * Duplicate-upload handling, including the concurrent case the pre-check cannot
 * see. Both requests insert a placeholder with a null hash before reading
 * bytes, so neither SELECT can observe the other — only the unique index can
 * arbitrate, and the route has to report the loser as a conflict rather than a
 * server error. All data fictional.
 */
test.describe.configure({ mode: "serial" });

let page: Page;
let treeId: string;
const png = samplePng();

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await login(page, OWNER.email, OWNER.password);
  treeId = await createArchive(page, "Dedup Archive");
});

test.afterAll(async () => {
  await page.close();
});

function upload(fileName: string) {
  return page.request.post(`/api/trees/${treeId}/media`, {
    headers: { "Content-Type": "image/png", "X-File-Name": encodeURIComponent(fileName) },
    data: png,
  });
}

test("a sequential re-upload of the same bytes is refused as a conflict", async () => {
  const first = await upload("portrait.png");
  expect(first.status()).toBe(201);

  const second = await upload("portrait-copy.png");
  expect(second.status()).toBe(409);
  const body = (await second.json()) as { duplicateOf?: string };
  expect(body.duplicateOf).toBe(((await first.json()) as { mediaId: string }).mediaId);
});

test("concurrent uploads of the same bytes settle as one success and one conflict", async () => {
  const other = await createArchive(page, "Dedup Race Archive");
  const race = () =>
    page.request.post(`/api/trees/${other}/media`, {
      headers: { "Content-Type": "image/png", "X-File-Name": encodeURIComponent("race.png") },
      data: png,
    });

  // Fired together so both get past the pre-check before either finalizes.
  const statuses = (await Promise.all([race(), race(), race()])).map((r) => r.status());

  // Exactly one may win. The losers must be 409s — a 500 would mean the unique
  // violation escaped as an unhandled error.
  expect(statuses.filter((s) => s === 201)).toHaveLength(1);
  expect(statuses.filter((s) => s === 409)).toHaveLength(2);
  expect(statuses).not.toContain(500);
});

test("the Upload media button uploads what's picked, and the same file can be picked again", async () => {
  // Through the real button, not the endpoint: the picker's change handler has
  // to hand over the files before it clears the input, and only this reaches it.
  const archive = await createArchive(page, "Upload Button Archive");
  await page.goto(`/trees/${archive}/media`);
  await page.waitForLoadState("networkidle");

  const pick = async () => {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Upload media" }).click();
    await (await chooser).setFiles({ name: "boathouse.png", mimeType: "image/png", buffer: png });
  };

  await pick();
  await expect(page.getByRole("link", { name: "uploaded ✓" })).toBeVisible();

  // Picking the same file again has to reach the server, which reports it.
  await pick();
  await expect(page.getByRole("link", { name: "(view existing)" })).toBeVisible();
});
