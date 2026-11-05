import { execSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

import {
  createArchive,
  createInvite,
  login,
  OWNER,
  pickPerson,
  registerViaInvite,
  SAMPLE_GEDCOM,
  samplePng,
  submitAction,
  uploadMedia,
} from "./helpers";

/**
 * Trash: restoring people and media, and removing them permanently (PRD §5.8). Driven
 * through the real controls wherever a person would use them. All data fictional.
 *
 * SMOKE_APP_EXEC is the command that reaches the app container, for example
 * "docker compose exec -T app". With it, the removal test also checks the media volume.
 * It is opt-in so that a default run can never look inside someone's own stack.
 */
test.describe.configure({ mode: "serial" });

const APP_EXEC = process.env.SMOKE_APP_EXEC;

const MEMBERS = {
  editor: { name: "Tobias Wren", email: "trash-editor@example.test", password: "trash-pass-1" },
  contributor: {
    name: "Odette Marsh",
    email: "trash-contrib@example.test",
    password: "trash-pass-2",
  },
  viewer: { name: "Silas Fenwick", email: "trash-viewer@example.test", password: "trash-pass-3" },
};
const OUTSIDER = {
  name: "Imogen Thorne",
  email: "trash-other@example.test",
  password: "trash-pass-4",
};

const CHILD = "Clementine Fairweather";
const PARENT = "Bartholomew Fairweather";
const PHOTO = "thistlewood-picnic.png";

let owner: Page;
let editor: Page;
let contributor: Page;
let viewer: Page;
let outsider: Page;
let treeId: string;
let otherTreeId: string;
let childId: string;
let parentId: string;
let photoId: string;
let collectionId: string;

/** PNG bytes plus a random tail, so the exact-duplicate check fires only when a test means it. */
function uniquePng(): Buffer {
  return Buffer.concat([samplePng(), randomBytes(16)]);
}

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

function trashPath(view: "media" | "people" | "merged"): string {
  return `/trees/${treeId}/trash?view=${view}`;
}

function entry(page: Page, name: string): Locator {
  return page.getByRole("listitem").filter({ hasText: name });
}

async function waitForThumbnail(page: Page, mediaId: string): Promise<void> {
  const thumb = page.locator(`a[href*="${mediaId}"] img[src*="/derivatives/"]`);
  const deadline = Date.now() + 90_000;
  for (;;) {
    await page.goto(`/trees/${treeId}/media?scope=all`);
    if ((await thumb.count()) > 0) return;
    if (Date.now() > deadline) throw new Error(`no thumbnail appeared for ${mediaId}`);
    await page.waitForTimeout(2_000);
  }
}

async function moveMediaToTrash(page: Page, mediaId: string): Promise<void> {
  await page.goto(`/trees/${treeId}/media/${mediaId}`);
  await page.locator('summary[title="More options"]').click();
  await page.getByText("Delete…", { exact: true }).click();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.waitForURL(new RegExp(`/media\\?trashed=${mediaId}`));
}

async function movePersonToTrash(page: Page, personId: string, name: string): Promise<void> {
  await page.goto(`/trees/${treeId}/people/${personId}/edit`);
  await page.getByRole("button", { name: `Move ${name} to Trash` }).click();
  await page.waitForURL(new RegExp(`/people\\?trashed=${personId}`));
}

async function removePermanently(
  page: Page,
  view: "media" | "people" | "merged",
  name: string,
): Promise<void> {
  await page.goto(trashPath(view));
  const row = entry(page, name);
  await row.getByText("Remove permanently…").click();
  await row.getByLabel("Type REMOVE to confirm").fill("REMOVE");
  await row.getByRole("button", { name: "Remove permanently", exact: true }).click();
  await expect(page.getByText("Permanently removed.")).toBeVisible();
}

async function createPerson(page: Page, name: string, year: string): Promise<string> {
  await page.goto(`/trees/${treeId}/people/new`);
  await page.getByLabel("Full name").fill(name);
  await page.locator('input[name="birthYear"]').fill(year);
  await page.getByRole("button", { name: "Add person" }).click();
  await page.waitForURL(/\/people\/[0-9a-f-]{36}/);
  return page.url().match(/\/people\/([0-9a-f-]{36})/)![1]!;
}

async function openProfile(page: Page, name: string): Promise<string> {
  await page.goto(`/trees/${treeId}/people?scope=all&q=${encodeURIComponent(name)}`);
  await page
    .getByRole("link", { name: new RegExp(name) })
    .first()
    .click();
  await page.getByRole("link", { name: "View profile" }).click();
  await page.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  return page.url().match(/\/people\/([0-9a-f-]{36})$/)![1]!;
}

/** The hidden field that names a server action, read from a form a permitted user was given. */
async function actionField(form: Locator): Promise<string> {
  const name = await form.locator('input[name^="$ACTION_ID_"]').getAttribute("name");
  expect(name, "form should carry a server-action field").toBeTruthy();
  return name!;
}

/** A row's Restore form, for reading its action. The removal form is the one with `confirm`. */
function restoreForm(page: Page, idField: "mediaId" | "personId"): Locator {
  return page
    .locator(`li form:has(input[name="${idField}"]):not(:has(input[name="confirm"]))`)
    .first();
}

/** Replays a server action from another session, as a hand-written POST could. */
function forge(
  request: APIRequestContext,
  action: string,
  fields: Record<string, string>,
): Promise<unknown> {
  return request.post(`/trees/${fields.treeId}/trash`, {
    multipart: { [action]: "", ...fields },
    maxRedirects: 0,
  });
}

function filesOnVolume(mediaId: string): string[] {
  const output = execSync(
    `${APP_EXEC} sh -c 'find /data/media/trees/${treeId}/media/${mediaId} -type f 2>/dev/null || true'`,
    { encoding: "utf8" },
  );
  return output.split("\n").filter(Boolean);
}

test.beforeAll(async ({ browser }) => {
  owner = await browser.newPage();
  await login(owner, OWNER.email, OWNER.password);
  treeId = await createArchive(owner, "Trash Lab Archive");
  otherTreeId = await createArchive(owner, "Trash Control Archive");

  for (const role of ["editor", "contributor", "viewer"] as const) {
    const token = await createInvite(owner, treeId, role);
    const context = await registerViaInvite(browser, token, MEMBERS[role], treeId);
    const page = context.pages()[0] ?? (await context.newPage());
    if (role === "editor") editor = page;
    if (role === "contributor") contributor = page;
    if (role === "viewer") viewer = page;
  }
  // An admin, but only of the other archive.
  const token = await createInvite(owner, otherTreeId, "admin");
  const context = await registerViaInvite(browser, token, OUTSIDER, otherTreeId);
  outsider = context.pages()[0] ?? (await context.newPage());

  await owner.goto("/trees/import");
  await owner.locator('input[name="file"]').setInputFiles({
    name: "fairweather.ged",
    mimeType: "text/plain",
    buffer: Buffer.from(SAMPLE_GEDCOM, "utf-8"),
  });
  await owner.locator('select[name="target"]').selectOption(treeId);
  await owner.getByRole("button", { name: "Import" }).click();
  await owner.waitForURL(new RegExp(`/trees/${treeId}\\?imported=1`));
  childId = await openProfile(owner, CHILD);
  parentId = await openProfile(owner, PARENT);
});

test.afterAll(async () => {
  for (const page of [owner, editor, contributor, viewer, outsider]) {
    await page?.context().close();
  }
});

test("a photo gets a tag, a person, a collection cover and a profile-photo role", async () => {
  test.setTimeout(180_000);
  photoId = await uploadMedia(owner, treeId, PHOTO, "image/png", uniquePng());
  await waitForThumbnail(owner, photoId);

  await owner.goto(`/trees/${treeId}/media/${photoId}`);
  await owner.locator('summary[title="Info"]').click();
  const tagForm = owner.locator('form:has(input[placeholder="Add a tag…"])');
  await tagForm.getByPlaceholder("Add a tag…").fill("harvest");
  await tagForm.getByRole("button", { name: "Add" }).click();
  await expect(owner.getByRole("link", { name: "harvest" })).toBeVisible();

  await owner.goto(`/trees/${treeId}/media/${photoId}`);
  await owner.getByText("+ Tag someone").click();
  const person = owner.getByRole("combobox", { name: "Person to tag" });
  await pickPerson(person, CHILD);
  await owner.locator("form", { has: person }).getByRole("button", { name: "Tag" }).click();
  await expect(owner.getByRole("link", { name: new RegExp(CHILD) })).toBeVisible();

  await owner.locator('summary[title="More options"]').click();
  await owner.getByText("Use as profile photo").click();
  await submitAction(owner, owner.getByRole("button", { name: CHILD }));
  await owner.goto(`/trees/${treeId}/people/${childId}`);
  await expect(owner.locator(`img[src*="${photoId}"]`).first()).toBeVisible();

  await owner.goto(`/trees/${treeId}/collections/new`);
  await owner.getByLabel("Name").fill("Thistlewood Summers");
  await owner.getByRole("button", { name: "Create collection" }).click();
  await owner.waitForURL(/\/collections\/[0-9a-f-]{36}/);
  collectionId = owner.url().match(/\/collections\/([0-9a-f-]{36})/)![1]!;

  await owner.goto(`/trees/${treeId}/media/${photoId}`);
  await owner.locator('summary[title="Info"]').click();
  const addForm = owner.locator('form:has(select[name="collectionId"])');
  await addForm
    .locator('select[name="collectionId"]')
    .selectOption({ label: "Thistlewood Summers" });
  await submitAction(owner, addForm.getByRole("button", { name: "Add" }));

  await owner.goto(`/trees/${treeId}/collections/${collectionId}`);
  await owner.getByLabel("Cover image").selectOption({ label: PHOTO });
  await submitAction(owner, owner.getByRole("button", { name: "Set cover" }));
  await owner.goto(`/trees/${treeId}/collections`);
  await expect(owner.locator(`a[href*="${collectionId}"] img`)).toBeVisible();
});

test("the delete control says what it does, and Undo brings the item straight back", async () => {
  await moveMediaToTrash(editor, photoId);
  await expect(editor.getByText("Moved to Trash.")).toBeVisible();
  await expect(editor.locator(`a[href*="${photoId}"]`)).toHaveCount(0);
  const gone = await editor.request.get(`/api/trees/${treeId}/media/${photoId}/original`);
  expect(gone.status()).toBe(404);

  await submitAction(editor, editor.getByRole("button", { name: "Undo" }));
  await editor.waitForURL(new RegExp(`/media/${photoId}$`));
  const back = await editor.request.get(`/api/trees/${treeId}/media/${photoId}/original`);
  expect(back.status()).toBe(200);
});

test("Trash shows what it holds, and restoring brings back everything attached", async () => {
  await moveMediaToTrash(owner, photoId);

  await owner.goto(trashPath("media"));
  const row = entry(owner, PHOTO);
  await expect(row).toContainText("Photo");
  await expect(row).toContainText("Smoke Owner");
  const thumb = row.locator("img");
  await expect(thumb).toHaveAttribute("src", new RegExp(`/trash/media/${photoId}/thumb`));
  await expect
    .poll(() => thumb.evaluate((img) => (img as unknown as { naturalWidth: number }).naturalWidth))
    .toBeGreaterThan(0);
  const thumbResponse = await owner.request.get(
    `/api/trees/${treeId}/trash/media/${photoId}/thumb`,
  );
  expect(thumbResponse.status()).toBe(200);
  expect(thumbResponse.headers()["cache-control"]).toBe("private, no-store");

  // While it is in Trash, everything that points at it behaves as if it were gone.
  await owner.goto(`/trees/${treeId}/people/${childId}`);
  await expect(owner.locator(`img[src*="${photoId}"]`)).toHaveCount(0);
  await owner.goto(`/trees/${treeId}/collections`);
  await expect(owner.locator(`a[href*="${collectionId}"] img`)).toHaveCount(0);
  await owner.goto(`/trees/${treeId}/collections/${collectionId}`);
  await expect(owner.locator(`a[href*="${photoId}"]`)).toHaveCount(0);

  await owner.goto(trashPath("media"));
  await entry(owner, PHOTO).getByRole("button", { name: "Restore" }).click();
  await expect(owner.getByText("Restored.")).toBeVisible();
  await expect(entry(owner, PHOTO)).toHaveCount(0);
  await owner.getByRole("link", { name: "Open it" }).click();
  await owner.waitForURL(new RegExp(`/media/${photoId}$`));

  await expect(owner.getByRole("link", { name: new RegExp(CHILD) })).toBeVisible();
  await owner.locator('summary[title="Info"]').click();
  await expect(owner.getByRole("link", { name: "harvest" })).toBeVisible();
  await owner.goto(`/trees/${treeId}/people/${childId}`);
  await expect(owner.locator(`img[src*="${photoId}"]`).first()).toBeVisible();
  await owner.goto(`/trees/${treeId}/collections`);
  await expect(owner.locator(`a[href*="${collectionId}"] img`)).toBeVisible();
  await owner.goto(`/trees/${treeId}/collections/${collectionId}`);
  await expect(owner.locator(`a[href*="${photoId}"]`)).toBeVisible();
});

test("restoring a person brings back relationships, tags and starting person", async () => {
  // A GEDCOM import's people share a creation time, so either could be the default start,
  // which offers no button. Choosing the parent first leaves the child's button available,
  // so this records a real preference rather than relying on the default.
  const setStart = owner.getByRole("button", { name: "Set as my starting person" });
  for (const personId of [parentId, childId]) {
    await owner.goto(`/trees/${treeId}?selected=${personId}`);
    if ((await setStart.count()) > 0) {
      await setStart.click();
      await expect(setStart).toBeHidden();
    }
  }
  await owner.goto(`/trees/${treeId}`);
  await expect(owner.getByText(`starting from ${CHILD}`)).toBeVisible();

  await movePersonToTrash(editor, childId, CHILD);
  await expect(editor.getByText("Moved to Trash.")).toBeVisible();
  await editor.goto(`/trees/${treeId}/people?scope=all`);
  await expect(editor.getByRole("link", { name: new RegExp(CHILD) })).toHaveCount(0);
  await owner.goto(`/trees/${treeId}`);
  await expect(owner.getByText(`starting from ${CHILD}`)).toHaveCount(0);
  await owner.goto(`/trees/${treeId}/media/${photoId}`);
  await expect(owner.getByRole("link", { name: new RegExp(CHILD) })).toHaveCount(0);

  await editor.goto(trashPath("people"));
  const row = entry(editor, CHILD);
  await expect(row).toContainText("1925");
  await expect(row).toContainText(MEMBERS.editor.name);
  await row.getByRole("button", { name: "Restore" }).click();
  await expect(editor.getByText("Restored.")).toBeVisible();

  await owner.goto(`/trees/${treeId}/people/${childId}`);
  await expect(owner.getByRole("link", { name: new RegExp(PARENT) }).first()).toBeVisible();
  await owner.goto(`/trees/${treeId}`);
  await expect(owner.getByText(`starting from ${CHILD}`)).toBeVisible();
  await owner.goto(`/trees/${treeId}/media/${photoId}`);
  await expect(owner.getByRole("link", { name: new RegExp(CHILD) })).toBeVisible();

  // Undo from the notice works for a person too, and returns to their profile.
  await movePersonToTrash(editor, childId, CHILD);
  await submitAction(editor, editor.getByRole("button", { name: "Undo" }));
  await editor.waitForURL(new RegExp(`/people/${childId}$`));
  await expect(editor.getByRole("heading", { name: CHILD })).toBeVisible();
});

test("a stale page explains that the item has already been dealt with", async () => {
  const mediaId = await uploadMedia(owner, treeId, "stale-page.png", "image/png", uniquePng());
  await moveMediaToTrash(owner, mediaId);

  await editor.goto(trashPath("media"));
  await owner.goto(trashPath("media"));
  await entry(owner, "stale-page.png").getByRole("button", { name: "Restore" }).click();
  await expect(owner.getByText("Restored.")).toBeVisible();

  await entry(editor, "stale-page.png").getByRole("button", { name: "Restore" }).click();
  await expect(editor.getByText("That item is no longer in Trash.")).toBeVisible();
});

test("a file uploaded again blocks its copy's restore; removing the copy spares the live one", async () => {
  const bytes = uniquePng();
  const firstId = await uploadMedia(owner, treeId, "harvest-letter.png", "image/png", bytes);
  await moveMediaToTrash(owner, firstId);
  // Allowed: the exact-duplicate check only looks at what's in the library.
  const liveId = await uploadMedia(owner, treeId, "harvest-letter-again.png", "image/png", bytes);

  await owner.goto(trashPath("media"));
  await entry(owner, "harvest-letter.png").getByRole("button", { name: "Restore" }).click();
  await expect(
    owner.getByText(/An identical copy of this file is already in the library/),
  ).toBeVisible();
  await expect(owner.getByRole("link", { name: "Open the copy" })).toHaveAttribute(
    "href",
    new RegExp(liveId),
  );
  await expect(entry(owner, "harvest-letter.png")).toBeVisible();

  await removePermanently(owner, "media", "harvest-letter.png");
  const live = await owner.request.get(`/api/trees/${treeId}/media/${liveId}/original`);
  expect(live.status()).toBe(200);
  expect(sha256(await live.body())).toBe(sha256(bytes));
});

test("a merged-away person is listed apart, with no way to restore them", async () => {
  await createPerson(owner, "Ignatius Quill", "1880");
  await createPerson(owner, "Ignatius Quill", "1880");
  await owner.goto(`/trees/${treeId}/duplicates`);
  await owner.getByRole("link", { name: "Compare & merge" }).click();
  await owner.waitForURL(/\/merge\//);
  const [, survivorId, otherId] = owner
    .url()
    .match(/people\/([0-9a-f-]{36})\/merge\/([0-9a-f-]{36})/)!;
  await owner.locator('input[name="confirm"]').fill("MERGE");
  await owner.getByRole("button", { name: /^Merge .* into / }).click();
  await owner.waitForURL(/merged=1/);

  await owner.goto(trashPath("people"));
  await expect(entry(owner, "Ignatius Quill")).toHaveCount(0);

  await owner.getByRole("link", { name: "Merged (1)" }).click();
  const row = entry(owner, "Ignatius Quill");
  await expect(row).toContainText("Merged into");
  await expect(row.getByRole("link", { name: "Ignatius Quill" })).toHaveAttribute(
    "href",
    new RegExp(survivorId!),
  );
  await expect(row.getByRole("button", { name: "Restore" })).toHaveCount(0);

  // There is no button, but a hand-written request must be refused all the same. The
  // action comes from another person's row, and replaying it for them shows it works.
  const controlId = await createPerson(owner, "Hester Vane", "1890");
  await movePersonToTrash(owner, controlId, "Hester Vane");
  await owner.goto(trashPath("people"));
  const restorePerson = await actionField(restoreForm(owner, "personId"));
  await forge(owner.request, restorePerson, { treeId, personId: otherId! });
  await forge(owner.request, restorePerson, { treeId, personId: controlId });
  await owner.goto(trashPath("people"));
  await expect(entry(owner, "Hester Vane")).toHaveCount(0);

  await owner.goto(trashPath("merged"));
  await expect(entry(owner, "Ignatius Quill")).toBeVisible();
  await owner.goto(`/trees/${treeId}/people?scope=all&q=Quill`);
  await expect(owner.getByRole("link", { name: /Ignatius Quill/ })).toHaveCount(1);
});

test("only editors and up can open Trash or its thumbnails", async ({ browser }) => {
  await moveMediaToTrash(owner, photoId);
  const thumbUrl = `/api/trees/${treeId}/trash/media/${photoId}/thumb`;
  expect((await owner.request.get(thumbUrl)).status()).toBe(200);

  for (const page of [contributor, viewer, outsider]) {
    expect((await page.goto(trashPath("media")))?.status()).toBe(404);
    expect((await page.request.get(thumbUrl)).status()).toBe(404);
  }
  for (const page of [contributor, viewer]) {
    await page.goto(`/trees/${treeId}/media?scope=all`);
    await expect(page.getByRole("link", { name: "Trash", exact: true })).toHaveCount(0);
    await page.goto(`/trees/${treeId}/people?scope=all`);
    await expect(page.getByRole("link", { name: "Trash", exact: true })).toHaveCount(0);
  }

  // Editors restore but don't remove; admins do both.
  await editor.goto(`/trees/${treeId}/media?scope=all`);
  await editor.getByRole("link", { name: "Trash", exact: true }).click();
  await editor.waitForURL(/\/trash\?view=media/);
  await expect(entry(editor, PHOTO).getByRole("button", { name: "Restore" })).toBeVisible();
  await expect(entry(editor, PHOTO).getByText("Remove permanently…")).toHaveCount(0);
  await owner.goto(trashPath("media"));
  await expect(entry(owner, PHOTO).getByText("Remove permanently…")).toBeVisible();

  // Public mode opens the archive to read, and Trash stays closed.
  await owner.goto(`/trees/${treeId}/settings`);
  await owner.getByLabel("Make this archive publicly viewable").check();
  await owner.getByRole("button", { name: "Save public access" }).click();
  await expect(owner.getByText("This archive is currently public.")).toBeVisible();

  const anonymous = await browser.newContext();
  const visitor = await anonymous.newPage();
  expect((await visitor.goto(`/trees/${treeId}/media`))?.status()).toBe(200);
  expect((await visitor.goto(trashPath("media")))?.status()).toBe(404);
  expect((await anonymous.request.get(thumbUrl)).status()).toBe(404);
  expect((await outsider.goto(trashPath("media")))?.status()).toBe(404);
  await anonymous.close();

  await owner.goto(`/trees/${treeId}/settings`);
  await owner.getByLabel("Make this archive publicly viewable").uncheck();
  await submitAction(owner, owner.getByRole("button", { name: "Save public access" }));
});

test("hand-written requests can't reach past a role or across archives", async ({ browser }) => {
  // The control: an editor's replay of a restore works, so the refusals below mean something.
  const controlId = await uploadMedia(owner, treeId, "control.png", "image/png", uniquePng());
  await moveMediaToTrash(owner, controlId);
  await owner.goto(trashPath("media"));
  const restore = await actionField(restoreForm(owner, "mediaId"));
  await forge(editor.request, restore, { treeId, mediaId: controlId });
  await owner.goto(trashPath("media"));
  await expect(entry(owner, "control.png")).toHaveCount(0);

  const purgeForm = entry(owner, PHOTO).locator('form:has(input[name="confirm"])');
  const purge = await actionField(purgeForm);
  const removal = { treeId, mediaId: photoId, confirm: "REMOVE" };

  await forge(contributor.request, restore, { treeId, mediaId: photoId });
  await forge(viewer.request, restore, { treeId, mediaId: photoId });
  await forge(editor.request, purge, removal);
  await forge(contributor.request, purge, removal);
  await forge(outsider.request, purge, removal);
  // Admin of the other archive, naming that archive and this item: the guard passes,
  // and the query must still find nothing.
  await forge(outsider.request, purge, { ...removal, treeId: otherTreeId });
  await forge(outsider.request, restore, { treeId: otherTreeId, mediaId: photoId });
  const anonymous = await browser.newContext();
  await forge(anonymous.request, purge, removal);
  await anonymous.close();

  await owner.goto(trashPath("media"));
  await expect(entry(owner, PHOTO)).toBeVisible();
  const thumb = await owner.request.get(`/api/trees/${treeId}/trash/media/${photoId}/thumb`);
  expect(thumb.status()).toBe(200);
});

test("permanent removal deletes the media and the references to it", async () => {
  const filesBefore = APP_EXEC ? filesOnVolume(photoId) : [];
  if (APP_EXEC) expect(filesBefore.length).toBeGreaterThanOrEqual(2);

  // The typed word is required.
  await owner.goto(trashPath("media"));
  const row = entry(owner, PHOTO);
  await row.getByText("Remove permanently…").click();
  await expect(row).toContainText("This can't be undone");
  await row.getByLabel("Type REMOVE to confirm").fill("remove it");
  await row.getByRole("button", { name: "Remove permanently", exact: true }).click();
  await expect(owner.getByText('Type "REMOVE" to confirm')).toBeVisible();
  await expect(entry(owner, PHOTO)).toBeVisible();

  await removePermanently(owner, "media", PHOTO);
  await expect(entry(owner, PHOTO)).toHaveCount(0);

  if (APP_EXEC) expect(filesOnVolume(photoId)).toEqual([]);
  for (const url of [
    `/api/trees/${treeId}/media/${photoId}/original`,
    `/api/trees/${treeId}/trash/media/${photoId}/thumb`,
  ]) {
    expect((await owner.request.get(url)).status(), url).toBe(404);
  }

  await owner.goto(`/trees/${treeId}/people/${childId}`);
  await expect(owner.getByRole("heading", { name: CHILD })).toBeVisible();
  await expect(owner.locator(`img[src*="${photoId}"]`)).toHaveCount(0);
  await owner.goto(`/trees/${treeId}/collections`);
  await expect(owner.locator(`a[href*="${collectionId}"] img`)).toHaveCount(0);
  await owner.goto(`/trees/${treeId}/collections/${collectionId}`);
  await expect(owner.locator(`a[href*="${photoId}"]`)).toHaveCount(0);
});

test("permanent removal of a person spares their media, and suggestions stop linking", async () => {
  const mediaId = await uploadMedia(owner, treeId, "kept-photo.png", "image/png", uniquePng());
  await owner.goto(`/trees/${treeId}/media/${mediaId}`);
  await owner.getByText("+ Tag someone").click();
  const person = owner.getByRole("combobox", { name: "Person to tag" });
  await pickPerson(person, CHILD);
  await owner.locator("form", { has: person }).getByRole("button", { name: "Tag" }).click();
  await expect(owner.getByRole("link", { name: new RegExp(CHILD) })).toBeVisible();

  await viewer.goto(`/trees/${treeId}/people/${childId}`);
  await viewer.getByText(`Suggest a correction for ${CHILD}`).click();
  await viewer.getByLabel("What should change?").fill("Her birth year looks a year early.");
  await viewer.getByRole("button", { name: "Send suggestion" }).click();
  await viewer.waitForURL(/suggested=1/);

  await movePersonToTrash(owner, childId, CHILD);
  await owner.goto(`/trees/${treeId}/suggestions`);
  await expect(owner.getByText(`${CHILD} (in Trash)`)).toBeVisible();
  await expect(owner.getByRole("link", { name: CHILD })).toHaveCount(0);

  await removePermanently(owner, "people", CHILD);
  await expect(entry(owner, CHILD)).toHaveCount(0);

  await owner.goto(`/trees/${treeId}/suggestions`);
  await expect(owner.getByText("a person who was removed")).toBeVisible();
  await expect(owner.getByText("Her birth year looks a year early.")).toBeVisible();

  expect((await owner.goto(`/trees/${treeId}/people/${childId}`))?.status()).toBe(404);
  await owner.goto(`/trees/${treeId}/people/${parentId}`);
  await expect(owner.getByRole("link", { name: new RegExp(CHILD) })).toHaveCount(0);
  await owner.goto(`/trees/${treeId}/media/${mediaId}`);
  await expect(owner.getByRole("heading", { name: /kept-photo/ })).toBeVisible();
  await expect(owner.getByRole("link", { name: new RegExp(CHILD) })).toHaveCount(0);
  // The starting person falls back rather than breaking the tree.
  await owner.goto(`/trees/${treeId}`);
  await expect(owner.getByText(`starting from ${CHILD}`)).toHaveCount(0);
});

test("every restore and removal is in the audit log", async () => {
  await owner.goto(`/trees/${treeId}/settings/audit`);
  for (const action of ["media.restored", "person.restored", "media.purged", "person.purged"]) {
    await expect(owner.getByText(action, { exact: true }).first(), action).toBeVisible();
  }
  await expect(owner.getByText(`Permanently removed media ${PHOTO}`)).toBeVisible();
  await expect(owner.getByText(`Permanently removed person ${CHILD}`)).toBeVisible();
  // Once from Trash, once by Undo: both are restores, so both are recorded.
  await expect(owner.getByText(`Restored person ${CHILD} from Trash`)).toHaveCount(2);
});
