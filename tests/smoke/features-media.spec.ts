import { expect, test, type Page } from "@playwright/test";

import {
  createArchive,
  fetchPortrait,
  login,
  OWNER,
  samplePdf,
  samplePng,
  uploadMedia,
} from "./helpers";

/**
 * Collections, media-detail actions (tags, person tagging, face assignment,
 * transcription, profile photo), and authorized media serving with ranges.
 * All data fictional.
 */
test.describe.configure({ mode: "serial" });

let page: Page;
let treeId: string;
let photoId: string;
let pdfId: string;
let portraitId: string;
let personId: string;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await login(page, OWNER.email, OWNER.password);
  treeId = await createArchive(page, "Media Features Archive");

  await page.goto(`/trees/${treeId}/people/new`);
  await page.getByLabel("Full name").fill("Beatrice Holloway");
  await page.getByRole("button", { name: "Add person" }).click();
  await page.waitForURL(/\/people\/([0-9a-f-]{36})/);
  personId = page.url().match(/\/people\/([0-9a-f-]{36})/)![1]!;

  photoId = await uploadMedia(page, treeId, "holloway-picnic.png", "image/png", samplePng());
  pdfId = await uploadMedia(
    page,
    treeId,
    "holloway-ledger.pdf",
    "application/pdf",
    samplePdf(["Ledger of the Holloway estate"]),
  );
});

test.afterAll(async () => {
  await page.close();
});

test("collection lifecycle: create, add media, set cover, remove, delete", async () => {
  test.setTimeout(240_000);
  await page.goto(`/trees/${treeId}/collections/new`);
  await page.getByLabel("Name").fill("The Bristol Years");
  await page.getByLabel("From year (optional)").fill("1900");
  await page.getByLabel("To year (optional)").fill("1950");
  await page.getByRole("button", { name: "Create collection" }).click();
  await page.waitForURL(/\/collections\/[0-9a-f-]{36}/);
  const collectionId = page.url().match(/\/collections\/([0-9a-f-]{36})/)![1]!;
  await expect(
    page.getByText("No media yet — add items from any media detail page."),
  ).toBeVisible();

  // Media joins a collection from the media detail page's Info popover.
  await page.goto(`/trees/${treeId}/media/${photoId}`);
  await page.locator('summary[title="Info"]').click();
  const addForm = page.locator('form:has(select[name="collectionId"])');
  await addForm.locator('select[name="collectionId"]').selectOption({ label: "The Bristol Years" });
  await addForm.getByRole("button", { name: "Add" }).click();
  // Reload for a deterministic popover state — the action leaves it open.
  await page.goto(`/trees/${treeId}/media/${photoId}`);
  await page.locator('summary[title="Info"]').click();
  await expect(page.locator('button[title="Remove from collection"]')).toBeVisible();

  await page.goto(`/trees/${treeId}/collections/${collectionId}`);
  await expect(page.getByText("1 item(s)", { exact: false })).toBeVisible();
  await expect(page.locator(`a[href*="${photoId}"]`)).toBeVisible();

  await page.getByLabel("Cover image").selectOption({ label: "holloway-picnic.png" });
  await page.getByRole("button", { name: "Set cover" }).click();
  // The card cover renders from the generated thumbnail, so poll until the
  // thumbnail job has produced one.
  const card = page.locator(`a[href*="${collectionId}"]`);
  const deadline = Date.now() + 90_000;
  for (;;) {
    await page.goto(`/trees/${treeId}/collections`);
    if ((await card.locator("img").count()) > 0) break;
    if (Date.now() > deadline) throw new Error("collection cover thumbnail never appeared");
    await page.waitForTimeout(3_000);
  }

  // Removing the media from the collection empties it again. Wait for the
  // chip to leave the DOM — navigating away too early aborts the action POST.
  await page.goto(`/trees/${treeId}/media/${photoId}`);
  await page.locator('summary[title="Info"]').click();
  await page.locator('button[title="Remove from collection"]').click();
  await expect(page.locator('button[title="Remove from collection"]')).toHaveCount(0);
  await page.goto(`/trees/${treeId}/collections/${collectionId}`);
  await expect(
    page.getByText("No media yet — add items from any media detail page."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Delete The Bristol Years" }).click();
  await page.waitForURL(new RegExp(`/trees/${treeId}/collections$`));
  await expect(page.locator(`a[href*="${collectionId}"]`)).toHaveCount(0);
});

test("tags can be added and removed on media", async () => {
  await page.goto(`/trees/${treeId}/media/${photoId}`);
  await page.locator('summary[title="Info"]').click();
  const tagForm = page.locator('form:has(input[placeholder="Add a tag…"])');
  await tagForm.getByPlaceholder("Add a tag…").fill("picnic");
  await tagForm.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("link", { name: "picnic" })).toBeVisible();

  // Reload for a deterministic popover state — the action leaves it open.
  await page.goto(`/trees/${treeId}/media/${photoId}`);
  await page.locator('summary[title="Info"]').click();
  await page.locator('button[title="Remove"]').click();
  await expect(page.getByRole("link", { name: "picnic" })).toHaveCount(0);
});

test("a person can be tagged without a face box and set as profile photo", async () => {
  await page.goto(`/trees/${treeId}/media/${photoId}`);
  await page.getByText("+ Tag someone").click();
  const personForm = page.locator('form:has(select[name="personId"])');
  const beatrice = await personForm
    .locator("option", { hasText: "Beatrice Holloway" })
    .getAttribute("value");
  await personForm.locator('select[name="personId"]').selectOption(beatrice!);
  await personForm.getByRole("button", { name: "Tag" }).click();
  await expect(page.getByRole("link", { name: /Beatrice Holloway/ })).toBeVisible();

  await page.locator('summary[title="More options"]').click();
  await page.getByText("Use as profile photo").click();
  await page.getByRole("button", { name: "Beatrice Holloway" }).click();
  // The action revalidates without any visible marker; let its POST finish
  // before navigating away.
  await page.waitForLoadState("networkidle");
  await page.goto(`/trees/${treeId}/people/${personId}`);
  await expect(page.locator(`img[src*="${photoId}"]`).first()).toBeVisible();
});

test("a detected face box can be assigned to a person", async () => {
  test.setTimeout(240_000);
  portraitId = await uploadMedia(
    page,
    treeId,
    "holloway-portrait.jpg",
    "image/jpeg",
    await fetchPortrait(),
  );

  // Wait for the detection job's box to appear on the media page.
  const deadline = Date.now() + 150_000;
  const box = page.locator('button[title*="Unidentified"]').first();
  for (;;) {
    await page.goto(`/trees/${treeId}/media/${portraitId}`);
    if ((await box.count()) > 0) break;
    if (Date.now() > deadline) throw new Error("face box never appeared");
    await page.waitForTimeout(3_000);
  }

  // Boxes fade in on hover; dispatch the click straight to the handler.
  await box.dispatchEvent("click");
  await expect(page.getByText("Who is this?")).toBeVisible();
  const assign = page.locator('select:has(option:text("— unassigned —"))');
  await assign.selectOption({ label: "Beatrice Holloway" });
  await expect(page.locator('button[title="Beatrice Holloway"]').first()).toBeVisible();
});

test("manual transcription persists on a PDF", async () => {
  await page.goto(`/trees/${treeId}/media/${pdfId}`);
  await page
    .locator('textarea[name="transcription"]')
    .fill("Ledger of the Holloway estate, corrected by hand.");
  await page.getByRole("button", { name: "Save transcription" }).click();
  await page.waitForLoadState("networkidle");
  await page.goto(`/trees/${treeId}/media/${pdfId}`);
  await expect(page.locator('textarea[name="transcription"]')).toHaveValue(
    "Ledger of the Holloway estate, corrected by hand.",
  );
});

test("derivatives are served and originals honor Range requests", async () => {
  test.setTimeout(240_000);
  // The grid switching to a generated thumbnail signals processing finished.
  const deadline = Date.now() + 120_000;
  let derivativeSrc: string | null = null;
  while (Date.now() < deadline) {
    await page.goto(`/trees/${treeId}/media?scope=all`);
    derivativeSrc = await page
      .locator('img[src*="/derivatives/"]')
      .first()
      .getAttribute("src")
      .catch(() => null);
    if (derivativeSrc) break;
    await page.waitForTimeout(3_000);
  }
  expect(derivativeSrc, "no derivative thumbnail appeared").toBeTruthy();
  const derivative = await page.request.get(derivativeSrc!);
  expect(derivative.status()).toBe(200);
  expect(derivative.headers()["content-type"]).toContain("image/");

  const ranged = await page.request.get(`/api/trees/${treeId}/media/${photoId}/original`, {
    headers: { Range: "bytes=0-7" },
  });
  expect(ranged.status()).toBe(206);
  expect(ranged.headers()["content-range"]).toMatch(/^bytes 0-7\/\d+$/);
  const body = await ranged.body();
  expect(body).toHaveLength(8);
  expect([...body.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
});
