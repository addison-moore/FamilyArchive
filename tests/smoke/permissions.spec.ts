import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { login, OWNER, samplePng } from "./helpers";

/**
 * Permission-matrix spec. Runs after smoke.spec via the
 * "permissions" project dependency, so the instance owner already exists.
 * All data is fictional.
 */
test.describe.configure({ mode: "serial" });

const ROLE_NAMES = ["admin", "editor", "contributor", "viewer"] as const;
type RoleName = (typeof ROLE_NAMES)[number];

const ROLE_USERS: Record<RoleName, { name: string; email: string; password: string }> = {
  admin: { name: "Perm Admin", email: "perm-admin@example.test", password: "perm-password-1" },
  editor: { name: "Perm Editor", email: "perm-editor@example.test", password: "perm-password-2" },
  contributor: {
    name: "Perm Contributor",
    email: "perm-contributor@example.test",
    password: "perm-password-3",
  },
  viewer: { name: "Perm Viewer", email: "perm-viewer@example.test", password: "perm-password-4" },
};

let ownerPage: Page;
let anonContext: BrowserContext;
/** Archive the four role users are members of. */
let probeTreeId: string;
/** Owner-only archive used as the cross-archive isolation target. */
let otherTreeId: string;
let probeMediaId: string;
let otherMediaId: string;
const contexts = {} as Record<RoleName, BrowserContext>;
const pages = {} as Record<RoleName, Page>;

function api(role: RoleName): APIRequestContext {
  return contexts[role].request;
}

/** Unique upload payload — PNG bytes plus a random tail so dedup never fires. */
function uniquePng(): Buffer {
  const salt = Buffer.alloc(16);
  for (let i = 0; i < salt.length; i += 4) {
    salt.writeUInt32LE((Math.random() * 0xffffffff) >>> 0, i);
  }
  return Buffer.concat([samplePng(), salt]);
}

function uploadMedia(request: APIRequestContext, treeId: string, name: string) {
  return request.post(`/api/trees/${treeId}/media`, {
    headers: { "Content-Type": "image/png", "X-File-Name": name },
    data: uniquePng(),
  });
}

async function createArchive(name: string): Promise<string> {
  await ownerPage.goto("/trees/new");
  await ownerPage.getByLabel("Name").fill(name);
  await ownerPage.getByRole("button", { name: "Create tree" }).click();
  await ownerPage.waitForURL(/\/trees\/[0-9a-f-]{36}/);
  return ownerPage.url().match(/\/trees\/([0-9a-f-]{36})/)![1]!;
}

/** Create an invite as the owner; the settings redirect carries the token. */
async function createInvite(treeId: string, role: RoleName): Promise<string> {
  await ownerPage.goto(`/trees/${treeId}/settings`);
  await ownerPage
    .locator('form:has([name="expiresInDays"]) select[name="role"]')
    .selectOption(role);
  await ownerPage.getByRole("button", { name: "Create invite" }).click();
  await ownerPage.waitForURL(/invite=/);
  const token = new URL(ownerPage.url()).searchParams.get("invite");
  expect(token, "settings redirect should carry the invite token").toBeTruthy();
  return token!;
}

test.beforeAll(async ({ browser }) => {
  ownerPage = await browser.newPage();
  anonContext = await browser.newContext();
});

test.afterAll(async () => {
  await ownerPage.close();
  await anonContext.close();
  for (const role of ROLE_NAMES) await contexts[role]?.close();
});

test("bootstrap: two archives and one member per role", async ({ browser }) => {
  await login(ownerPage, OWNER.email, OWNER.password);
  probeTreeId = await createArchive("Permission Probe Archive");
  otherTreeId = await createArchive("Isolation Control Archive");

  for (const role of ROLE_NAMES) {
    const token = await createInvite(probeTreeId, role);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/invite/${token}`);
    await page.getByLabel("Name").fill(ROLE_USERS[role].name);
    await page.getByLabel("Email").fill(ROLE_USERS[role].email);
    await page.getByLabel(/Password/).fill(ROLE_USERS[role].password);
    await page.getByRole("button", { name: "Create account and join" }).click();
    await page.waitForURL(new RegExp(`/trees/${probeTreeId}`));
    contexts[role] = context;
    pages[role] = page;
  }

  const probeUpload = await uploadMedia(api("admin"), probeTreeId, "probe-fixture.png");
  expect(probeUpload.status(), await probeUpload.text()).toBe(201);
  probeMediaId = ((await probeUpload.json()) as { mediaId: string }).mediaId;

  const otherUpload = await uploadMedia(ownerPage.request, otherTreeId, "isolation-fixture.png");
  expect(otherUpload.status(), await otherUpload.text()).toBe(201);
  otherMediaId = ((await otherUpload.json()) as { mediaId: string }).mediaId;
});

test("media upload requires contributor or above", async () => {
  for (const role of ["editor", "contributor"] as const) {
    const response = await uploadMedia(api(role), probeTreeId, `${role}-upload.png`);
    expect(response.status(), `${role} upload`).toBe(201);
  }
  const viewer = await uploadMedia(api("viewer"), probeTreeId, "viewer-upload.png");
  expect(viewer.status()).toBe(403);
  const anonymous = await uploadMedia(anonContext.request, probeTreeId, "anon-upload.png");
  expect(anonymous.status()).toBe(403);
});

test("archive export requires admin", async () => {
  for (const role of ["editor", "contributor", "viewer"] as const) {
    const post = await api(role).post(`/api/trees/${probeTreeId}/export`, { data: {} });
    expect(post.status(), `${role} export start`).toBe(403);
    const get = await api(role).get(`/api/trees/${probeTreeId}/export`);
    expect(get.status(), `${role} export status`).toBe(404);
  }
  const anonymous = await anonContext.request.get(`/api/trees/${probeTreeId}/export`);
  expect(anonymous.status()).toBe(404);

  const post = await api("admin").post(`/api/trees/${probeTreeId}/export`, { data: {} });
  expect(post.status(), await post.text()).toBe(201);
  const get = await api("admin").get(`/api/trees/${probeTreeId}/export`);
  expect(get.status()).toBe(200);
});

test("GEDCOM download and original serving are member-only on a private archive", async () => {
  for (const role of ROLE_NAMES) {
    const gedcom = await api(role).get(`/api/trees/${probeTreeId}/gedcom`);
    expect(gedcom.status(), `${role} gedcom`).toBe(200);
    expect(gedcom.headers()["content-type"]).toContain("text/plain");

    const original = await api(role).get(
      `/api/trees/${probeTreeId}/media/${probeMediaId}/original`,
    );
    expect(original.status(), `${role} original`).toBe(200);
  }
  const anonGedcom = await anonContext.request.get(`/api/trees/${probeTreeId}/gedcom`);
  expect(anonGedcom.status()).toBe(404);
  const anonOriginal = await anonContext.request.get(
    `/api/trees/${probeTreeId}/media/${probeMediaId}/original`,
  );
  expect(anonOriginal.status()).toBe(404);
});

test("settings page is admin-only; people page gates Add person at editor", async () => {
  const adminSettings = await pages.admin.goto(`/trees/${probeTreeId}/settings`);
  expect(adminSettings?.status()).toBe(200);
  await expect(pages.admin.getByRole("heading", { name: "Storage", exact: true })).toBeVisible();

  for (const role of ["editor", "contributor", "viewer"] as const) {
    const response = await pages[role].goto(`/trees/${probeTreeId}/settings`);
    expect(response?.status(), `${role} settings`).toBe(404);
  }

  for (const role of ROLE_NAMES) {
    const response = await pages[role].goto(`/trees/${probeTreeId}/people?scope=all`);
    expect(response?.status(), `${role} people`).toBe(200);
    const addPerson = pages[role].getByRole("link", { name: "Add person" });
    if (role === "admin" || role === "editor") {
      await expect(addPerson, `${role} sees Add person`).toBeVisible();
    } else {
      await expect(addPerson, `${role} must not see Add person`).toHaveCount(0);
    }
  }
});

test("anonymous visitors are redirected to login on a private archive", async () => {
  const page = await anonContext.newPage();
  await page.goto(`/trees/${probeTreeId}/people`);
  await page.waitForURL(/\/login/);
  await page.close();
});

test("members of one archive cannot touch another (isolation)", async () => {
  const editor = api("editor");

  const peoplePage = await pages.editor.goto(`/trees/${otherTreeId}/people`);
  expect(peoplePage?.status()).toBe(404);

  const gedcom = await editor.get(`/api/trees/${otherTreeId}/gedcom`);
  expect(gedcom.status()).toBe(404);

  const upload = await uploadMedia(editor, otherTreeId, "cross-archive.png");
  expect(upload.status()).toBe(403);

  const original = await editor.get(`/api/trees/${otherTreeId}/media/${otherMediaId}/original`);
  expect(original.status()).toBe(404);

  const exportStatus = await editor.get(`/api/trees/${otherTreeId}/export`);
  expect(exportStatus.status()).toBe(404);
});

test("media ids cannot be reached through another archive's tree path", async () => {
  // Even the instance owner (admin everywhere) must get a 404 when the
  // tree/media pairing is wrong — media lookups are tree-scoped.
  const mismatched = await ownerPage.request.get(
    `/api/trees/${probeTreeId}/media/${otherMediaId}/original`,
  );
  expect(mismatched.status()).toBe(404);

  const editorMismatch = await api("editor").get(
    `/api/trees/${probeTreeId}/media/${otherMediaId}/original`,
  );
  expect(editorMismatch.status()).toBe(404);
});
