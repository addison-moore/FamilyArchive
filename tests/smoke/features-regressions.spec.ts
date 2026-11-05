import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  createArchive,
  createInvite,
  login,
  OWNER,
  registerViaInvite,
  samplePdf,
  samplePng,
  submitAction,
  uploadMedia,
} from "./helpers";

/**
 * Bugs that reached a running stack without any test noticing, each pinned at the
 * level it was seen: through the real control or the real endpoint. All data
 * fictional.
 */
test.describe.configure({ mode: "serial" });

let page: Page;
let treeId: string;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await login(page, OWNER.email, OWNER.password);
  treeId = await createArchive(page, "Regression Archive");
});

test.afterAll(async () => {
  await page.close();
});

async function openAccountMenu() {
  await page.locator("summary", { hasText: OWNER.name }).first().click();
}

test("switching the theme keeps the session", async () => {
  // users.updatedAt doubles as "credentials changed at", and the toggle bumped it.
  await page.goto("/trees");
  await openAccountMenu();
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.goto("/trees");
  expect(page.url()).not.toContain("/login");

  await openAccountMenu();
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("a GEDCOM above the Server Action default of 1 MB imports", async () => {
  let gedcom = "0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n";
  for (let i = 1; gedcom.length < 1_200_000; i++) {
    gedcom +=
      `0 @I${i}@ INDI\n1 NAME Fictional${i} /Regression/\n1 SEX U\n1 BIRT\n2 DATE ${1700 + (i % 300)}\n` +
      "2 PLAC Nowhere Township, Imaginary County\n1 NOTE Generated for a size test.\n";
  }
  gedcom += "0 TRLR\n";

  await page.goto("/trees/import");
  await page.locator('input[name="file"]').setInputFiles({
    name: "regression-large.ged",
    mimeType: "text/plain",
    buffer: Buffer.from(gedcom, "utf-8"),
  });
  await page.locator('select[name="target"]').selectOption("new");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.waitForURL(/imported=1/, { timeout: 110_000 });
});

test("an upload whose bytes contradict its declared type is refused", async () => {
  const upload = (name: string, mime: string, body: string) =>
    page.request.post(`/api/trees/${treeId}/media`, {
      headers: { "Content-Type": mime, "X-File-Name": name },
      data: Buffer.from(body),
    });

  const playlist = await upload(
    "playlist.mp4",
    "video/mp4",
    "#EXTM3U\n#EXTINF:10.0,\nfile:///etc/passwd\n#EXT-X-ENDLIST\n",
  );
  expect(playlist.status()).toBe(415);
  const markup = await upload("page.png", "image/png", "<!doctype html><script></script>");
  expect(markup.status()).toBe(415);

  // Refused means gone: no placeholder left behind in the library.
  await page.goto(`/trees/${treeId}/media`);
  await expect(page.getByText("playlist.mp4")).toHaveCount(0);
});

test("originals honour valid ranges and ignore inverted ones", async () => {
  const png = samplePng();
  const mediaId = await uploadMedia(page, treeId, "regression-range.png", "image/png", png);
  const original = `/api/trees/${treeId}/media/${mediaId}/original`;

  const inverted = await page.request.get(original, { headers: { Range: "bytes=20-10" } });
  expect(inverted.status()).toBe(200);
  expect((await inverted.body()).length).toBe(png.length);

  const partial = await page.request.get(original, { headers: { Range: "bytes=0-9" } });
  expect(partial.status()).toBe(206);
  expect((await partial.body()).length).toBe(10);
});

test("a HEIC photo gets a thumbnail", async () => {
  // sharp's prebuilt libvips reads AVIF but not HEVC, so these always failed.
  const heic = readFileSync(join(__dirname, "fixtures", "solid-color.heic"));
  const mediaId = await uploadMedia(page, treeId, "regression.heic", "image/heic", heic);

  await expect(async () => {
    await page.goto(`/trees/${treeId}/media/${mediaId}`);
    await expect(page.getByText("Preparing…")).toHaveCount(0, { timeout: 1_000 });
    await expect(page.getByText("Something went wrong")).toHaveCount(0, { timeout: 1_000 });
    await expect(page.locator('img[src*="/derivatives/"]').first()).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 90_000 });
});

test("each video container gets a thumbnail and a poster through the pinned demuxers", async () => {
  // The worker names ffmpeg's demuxer rather than letting it probe, so a container
  // missing from that table would fail here rather than for someone's home movies.
  for (const [file, mime] of [
    ["tiny.mp4", "video/mp4"],
    ["tiny.mov", "video/quicktime"],
    ["tiny.webm", "video/webm"],
  ] as const) {
    const body = readFileSync(join(__dirname, "fixtures", file));
    const mediaId = await uploadMedia(page, treeId, `regression-${file}`, mime, body);
    await expect(async () => {
      await page.goto(`/trees/${treeId}/media/${mediaId}`);
      await expect(page.getByText("Preparing…")).toHaveCount(0, { timeout: 1_000 });
      await expect(page.getByText("Something went wrong")).toHaveCount(0, { timeout: 1_000 });
      await expect(page.locator("video")).toHaveAttribute("poster", /\/derivatives\//, {
        timeout: 1_000,
      });
    }).toPass({ timeout: 60_000 });
  }
});

test("a PDF filed as a document still reads, and the type picker fits the file", async () => {
  const mediaId = await uploadMedia(
    page,
    treeId,
    "regression-letter.pdf",
    "application/pdf",
    samplePdf(["Regression ledger for Fictional County"]),
  );
  const detail = `/trees/${treeId}/media/${mediaId}`;
  const ocrFinished = async () => {
    await expect(async () => {
      await page.goto(detail);
      await expect(page.getByText("Reading the text in this document")).toHaveCount(0, {
        timeout: 1_000,
      });
      await expect(page.getByText("Regression ledger", { exact: false })).toBeVisible({
        timeout: 1_000,
      });
    }).toPass({ timeout: 90_000 });
  };
  await ocrFinished();

  await page.locator('summary[aria-label="Edit details"]').click();
  const picker = page.locator('select[name="mediaType"]');
  await expect(picker.locator("option")).toHaveText(["PDF", "Document"]);
  await picker.selectOption("document");
  await submitAction(page, page.getByRole("button", { name: "Save", exact: true }));

  await page.goto(detail);
  await submitAction(page, page.getByRole("button", { name: "Extract text again" }));
  await ocrFinished();
  await expect(page.getByText("couldn't read the text")).toHaveCount(0);
});

test("adding a relative from the tree is audited", async () => {
  await page.goto(`/trees/${treeId}/people/new`);
  await page.getByLabel("Full name").fill("Regression Root");
  await page.getByRole("button", { name: "Add person" }).click();
  await page.waitForURL(/\/people\/[0-9a-f-]{36}/);

  await page.goto(`/trees/${treeId}`);
  await page.getByText("Add child", { exact: true }).click();
  const form = page.locator('form:has(input[name="direction"][value="child"])');
  await form.locator('input[name="fullName"]').fill("Regression Child");
  await form.getByRole("button", { name: "Add" }).click();
  await page.waitForURL(/selected=/);

  await page.goto(`/trees/${treeId}/settings/audit`);
  await expect(page.getByText("Created person Regression Child")).toBeVisible();
});

test("responses carry the security headers", async () => {
  const headers = (await page.request.get("/login")).headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("same-origin");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("a public archive shows outsiders its content, not its members or member actions", async ({
  browser,
}) => {
  await page.goto(`/trees/${treeId}/settings`);
  await page.getByLabel("Make this archive publicly viewable").check();
  await page.getByRole("button", { name: "Save public access" }).click();
  await expect(page.getByText("This archive is currently public.")).toBeVisible();

  const anonymous = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const visitor = await anonymous.newPage();
  await visitor.goto(`/trees/${treeId}/search`);
  await expect(visitor.getByRole("button", { name: "Search" })).toBeVisible();
  await expect(visitor.locator('select[name="uploader"]')).toHaveCount(0);
  await anonymous.close();

  // Signed in, but a member of a different archive: reading is fine, acting is not.
  const elsewhere = await createArchive(page, "Regression Elsewhere");
  const token = await createInvite(page, elsewhere, "viewer");
  const outsiderContext = await registerViaInvite(
    browser,
    token,
    {
      name: "Regression Outsider",
      email: "regression-outsider@example.test",
      password: "regression-pass-1",
    },
    elsewhere,
  );
  const outsider = await outsiderContext.newPage();
  await outsider.goto(`/trees/${treeId}`);
  await expect(outsider.getByRole("button", { name: "Set as my starting person" })).toHaveCount(0);
  await outsider.goto(`/trees/${treeId}/suggestions`);
  await expect(
    outsider.getByText("Only members of this archive can view and submit suggestions."),
  ).toBeVisible();
  await outsiderContext.close();

  await page.goto(`/trees/${treeId}/settings`);
  await page.getByLabel("Make this archive publicly viewable").uncheck();
  await submitAction(page, page.getByRole("button", { name: "Save public access" }));
});
