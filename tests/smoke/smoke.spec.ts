import { expect, test, type Page } from "@playwright/test";

import {
  fetchPortrait,
  INVITEE,
  login,
  OWNER,
  SAMPLE_GEDCOM,
  samplePdf,
  samplePng,
} from "./helpers";

/**
 * FamilyArchive smoke suite (PRD §32.2). Runs serially against a FRESH
 * instance (see playwright.config.ts); later tests build on earlier state.
 */
test.describe.configure({ mode: "serial" });

let page: Page;
let treeId: string;
let pdfMediaId: string;
let portraitMediaId: string;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});

test.afterAll(async () => {
  await page.close();
});

/** Upload a file through the media endpoint using the page's session. */
async function uploadMedia(fileName: string, mime: string, body: Buffer): Promise<string> {
  const response = await page.request.post(`/api/trees/${treeId}/media`, {
    headers: { "Content-Type": mime, "X-File-Name": encodeURIComponent(fileName) },
    data: body,
  });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { mediaId: string }).mediaId;
}

/** Reload `url` until `assertion` passes — for background jobs. */
async function pollFor(
  url: string,
  assertion: () => Promise<void>,
  timeoutMs = 90_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = new Error("pollFor: never ran");
  while (Date.now() < deadline) {
    await page.goto(url);
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(3_000);
    }
  }
  throw lastError;
}

test("register (owner bootstrap) and log in", async () => {
  await page.goto("/register");
  await expect(page.getByText("account becomes the instance owner")).toBeVisible();
  await page.getByLabel("Name").fill(OWNER.name);
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel(/Password/).fill(OWNER.password);
  await page.getByRole("button", { name: "Create owner account" }).click();
  await page.waitForURL(/\/trees/);

  // Prove credential login works, not just the bootstrap session.
  await page.context().clearCookies();
  await login(page, OWNER.email, OWNER.password);
  await expect(page.getByText(OWNER.name)).toBeVisible();
});

test("owner can create an archive", async () => {
  await page.goto("/trees/new");
  await page.getByLabel("Name").fill("Smoke Test Archive");
  await page.getByRole("button", { name: "Create tree" }).click();
  await page.waitForURL(/\/trees\/[0-9a-f-]{36}/);
  treeId = page.url().match(/\/trees\/([0-9a-f-]{36})/)![1]!;
});

test("user can create people", async () => {
  for (const person of [
    { name: "Arthur Ashford", year: "1888" },
    { name: "Rose Ashford", year: "1923" },
  ]) {
    await page.goto(`/trees/${treeId}/people/new`);
    await page.getByLabel("Full name").fill(person.name);
    await page.locator('input[name="birthYear"]').fill(person.year);
    await page.getByRole("button", { name: "Add person" }).click();
    await page.waitForURL(/\/people\/[0-9a-f-]{36}/);
  }
  await page.goto(`/trees/${treeId}/people?scope=all`);
  await expect(page.getByRole("link", { name: /Arthur Ashford/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Rose Ashford/ })).toBeVisible();
});

test("user can create a relationship", async () => {
  await page.goto(`/trees/${treeId}/people?scope=all`);
  await page.getByRole("link", { name: /Rose Ashford/ }).click();
  await page.getByRole("link", { name: "View profile" }).click();
  await page.waitForURL(/\/people\/[0-9a-f-]{36}$/);

  const addParent = page.locator("details", { hasText: "Add parent" }).first();
  await addParent.locator("summary").click();
  await addParent.locator('select[name="otherPersonId"]').selectOption({ index: 1 });
  await addParent.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Parents" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Arthur Ashford" })).toBeVisible();
});

test("interactive tree renders", async () => {
  await page.goto(`/trees/${treeId}`, { waitUntil: "networkidle" });
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
});

test("media upload succeeds", async () => {
  const photoId = await uploadMedia("smoke-photo.png", "image/png", samplePng());
  await page.goto(`/trees/${treeId}/media/${photoId}`);
  await expect(page.getByRole("heading", { name: "smoke-photo.png" })).toBeVisible();
});

test("thumbnail job completes", async () => {
  const portrait = await fetchPortrait();
  portraitMediaId = await uploadMedia("smoke-portrait.jpg", "image/jpeg", portrait);
  await pollFor(`/trees/${treeId}/media/${portraitMediaId}`, async () => {
    await expect(page.getByText("Status: processed")).toBeVisible({ timeout: 2_000 });
  });
  // Grid serves the generated derivative thumbnail.
  await page.goto(`/trees/${treeId}/media?scope=all`);
  await expect(page.locator('img[src*="/derivatives/"]').first()).toBeVisible();
});

test("OCR job completes on a sample PDF", async () => {
  test.setTimeout(240_000);
  pdfMediaId = await uploadMedia(
    "smoke-doc.pdf",
    "application/pdf",
    samplePdf(["Parish record of the Ashford family", "Witnessed by the quicksilver notary"]),
  );
  await pollFor(
    `/trees/${treeId}/media/${pdfMediaId}`,
    async () => {
      await expect(page.getByText("OCR: done")).toBeVisible({ timeout: 2_000 });
    },
    150_000,
  );
  // The OCR details element is open by default when there is no transcription;
  // force it open regardless so the assertion never toggles it shut.
  await page
    .locator("details", { hasText: "Extracted text (OCR)" })
    .first()
    .evaluate((el) => el.setAttribute("open", ""));
  await expect(page.getByText(/quicksilver notary/)).toBeVisible();
});

test("face detection creates face boxes", async () => {
  test.setTimeout(240_000);
  await pollFor(
    `/trees/${treeId}/media/${portraitMediaId}`,
    async () => {
      await expect(page.getByText(/Face detection: done/)).toBeVisible({ timeout: 2_000 });
    },
    150_000,
  );
  await expect(page.locator('button[title*="Unidentified"]').first()).toBeVisible();
});

test("search returns expected person and media", async () => {
  await page.goto(`/trees/${treeId}/search?q=Arthur&scope=all`);
  await expect(page.getByRole("heading", { name: /People \(/ })).toBeVisible();
  await expect(
    page
      .locator("section")
      .filter({ hasText: "People" })
      .getByRole("link", { name: /Arthur Ashford/ }),
  ).toBeVisible();

  // Found via OCR text only — "quicksilver" appears nowhere in metadata.
  await page.goto(`/trees/${treeId}/search?q=quicksilver&scope=all`);
  await expect(page.getByRole("heading", { name: /Media \(/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /smoke-doc\.pdf/ })).toBeVisible();
});

test("invite link grants the invited role", async ({ browser }) => {
  await page.goto(`/trees/${treeId}/settings`);
  await page.locator('form:has([name="expiresInDays"]) select[name="role"]').selectOption("editor");
  await page.getByRole("button", { name: "Create invite" }).click();
  await page.waitForURL(/invite=/);
  const inviteUrl = await page.locator("input[readonly]").inputValue();
  const token = inviteUrl.match(/invite\/([\w-]+)/)![1]!;

  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  await inviteePage.goto(`/invite/${token}`);
  await inviteePage.getByLabel("Name").fill(INVITEE.name);
  await inviteePage.getByLabel("Email").fill(INVITEE.email);
  await inviteePage.getByLabel(/Password/).fill(INVITEE.password);
  await inviteePage.getByRole("button", { name: "Create account and join" }).click();
  await inviteePage.waitForURL(new RegExp(`/trees/${treeId}`));
  await expect(inviteePage.getByText("your role: editor")).toBeVisible();

  // Editors can edit people — the Add person button proves the granted role.
  await inviteePage.goto(`/trees/${treeId}/people?scope=all`);
  await expect(inviteePage.getByRole("link", { name: "Add person" })).toBeVisible();
  await inviteeContext.close();
});

test("public mode exposes a read-only archive", async ({ browser }) => {
  await page.goto(`/trees/${treeId}/settings`);
  await page.getByLabel("Make this archive publicly viewable").check();
  await page.getByRole("button", { name: "Save public access" }).click();
  await expect(page.getByText("This archive is currently public.")).toBeVisible();

  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();
  await anonPage.goto(`/trees/${treeId}/people`);
  await expect(anonPage.getByText("public archive — read-only")).toBeVisible();
  await expect(anonPage.getByRole("link", { name: /Arthur Ashford/ })).toBeVisible();
  await expect(anonPage.getByRole("link", { name: "Add person" })).toHaveCount(0);

  // Flip it back off; anonymous must be locked out again. Wait for the
  // revalidated page to drop the "currently public" banner before checking.
  await page.goto(`/trees/${treeId}/settings`);
  await page.getByLabel("Make this archive publicly viewable").uncheck();
  await page.getByRole("button", { name: "Save public access" }).click();
  await expect(page.getByText("This archive is currently public.")).toHaveCount(0);
  await anonPage.goto(`/trees/${treeId}/people`);
  await anonPage.waitForURL(/\/login/);
  await anonContext.close();
});

test("GEDCOM import creates an archive", async () => {
  await page.goto("/trees/import");
  await page.locator('input[name="file"]').setInputFiles({
    name: "fairweather.ged",
    mimeType: "text/plain",
    buffer: Buffer.from(SAMPLE_GEDCOM, "utf-8"),
  });
  await page.locator('select[name="target"]').selectOption("new");
  await page.locator('input[name="treeName"]').fill("Fairweather Import");
  await page.getByRole("button", { name: "Import" }).click();
  await page.waitForURL(/imported=1/);
  await expect(page.getByText(/GEDCOM import complete: 3 people/)).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
});
