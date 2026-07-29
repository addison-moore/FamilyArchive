import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  createArchive,
  createInvite,
  login,
  OWNER,
  registerViaInvite,
  samplePng,
  uploadMedia,
} from "./helpers";

/**
 * Branch views, suggestions review, member management, and soft deletes
 * (PRD §8, §10.6, §12, §21). All data fictional (§1.5).
 */
test.describe.configure({ mode: "serial" });

const MEMBER = {
  name: "Gwendolyn Sparrow",
  email: "gov-member@example.test",
  password: "gov-password-1",
};

let ownerPage: Page;
let memberContext: BrowserContext;
let memberPage: Page;
let treeId: string;

test.beforeAll(async ({ browser }) => {
  ownerPage = await browser.newPage();
  await login(ownerPage, OWNER.email, OWNER.password);
  treeId = await createArchive(ownerPage, "Governance Archive");

  // Creation order matters: the earliest person is the default branch anchor.
  for (const person of [
    { name: "Augusta Pemberton", year: "1870" },
    { name: "Barnaby Pemberton", year: "1899" },
    { name: "Cordelia Winslow", year: "1902" },
  ]) {
    await ownerPage.goto(`/trees/${treeId}/people/new`);
    await ownerPage.getByLabel("Full name").fill(person.name);
    await ownerPage.locator('input[name="birthYear"]').fill(person.year);
    await ownerPage.getByRole("button", { name: "Add person" }).click();
    await ownerPage.waitForURL(/\/people\/[0-9a-f-]{36}/);
  }

  // Barnaby is Augusta's child — blood kin; Cordelia stays unrelated.
  await ownerPage.goto(`/trees/${treeId}/people?scope=all`);
  await ownerPage.getByRole("link", { name: /Barnaby Pemberton/ }).click();
  await ownerPage.getByRole("link", { name: "View profile" }).click();
  await ownerPage.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  const addParent = ownerPage.locator("details", { hasText: "Add parent" }).first();
  await addParent.locator("summary").click();
  // Option labels append the lifespan, so resolve the option's value first.
  const augusta = await addParent
    .locator('select[name="otherPersonId"] option', { hasText: "Augusta Pemberton" })
    .getAttribute("value");
  await addParent.locator('select[name="otherPersonId"]').selectOption(augusta!);
  await addParent.getByRole("button", { name: "Add", exact: true }).click();
  await expect(ownerPage.getByRole("heading", { name: "Parents" })).toBeVisible();
});

test.afterAll(async () => {
  await ownerPage.close();
  await memberContext?.close();
});

test("branch view shows blood kin only; Everyone shows the whole archive", async () => {
  await ownerPage.goto(`/trees/${treeId}/people`);
  await expect(ownerPage.getByText("2 of 3 people")).toBeVisible();
  await expect(ownerPage.getByRole("link", { name: /Augusta Pemberton/ })).toBeVisible();
  await expect(ownerPage.getByRole("link", { name: /Barnaby Pemberton/ })).toBeVisible();
  await expect(ownerPage.getByRole("link", { name: /Cordelia Winslow/ })).toHaveCount(0);

  await ownerPage.getByRole("link", { name: "Everyone" }).click();
  await ownerPage.waitForURL(/scope=all/);
  await expect(ownerPage.getByRole("link", { name: /Cordelia Winslow/ })).toBeVisible();
  await expect(ownerPage.getByText("2 of 3 people")).toHaveCount(0);

  await ownerPage.getByRole("link", { name: "My branch" }).click();
  await ownerPage.waitForURL(/scope=branch/);
  await expect(ownerPage.getByRole("link", { name: /Cordelia Winslow/ })).toHaveCount(0);
});

test("a viewer submits a suggestion and an admin resolves it", async ({ browser }) => {
  const token = await createInvite(ownerPage, treeId, "viewer");
  memberContext = await registerViaInvite(browser, token, MEMBER, treeId);
  memberPage = memberContext.pages()[0] ?? (await memberContext.newPage());

  await memberPage.goto(`/trees/${treeId}/suggestions`);
  await memberPage.getByText("Suggest a correction", { exact: true }).click();
  await memberPage
    .getByLabel("What should change?")
    .fill("Augusta's birthplace should be listed as Harrowgate.");
  await memberPage.getByRole("button", { name: "Send suggestion" }).click();
  await memberPage.waitForURL(/suggested=1/);
  await expect(memberPage.getByText("Suggestion sent — an admin will review it.")).toBeVisible();

  await ownerPage.goto(`/trees/${treeId}/suggestions`);
  await expect(ownerPage.getByRole("heading", { name: /Open \(1\)/ })).toBeVisible();
  await expect(ownerPage.getByText(/birthplace should be listed as Harrowgate/)).toBeVisible();
  await ownerPage.getByLabel("Note (optional)").fill("Confirmed against the parish ledger.");
  await ownerPage.getByRole("button", { name: "Accept" }).click();
  await expect(ownerPage.getByRole("heading", { name: /Resolved \(1\)/ })).toBeVisible();
  await expect(ownerPage.getByText("accepted", { exact: true })).toBeVisible();
  await expect(ownerPage.getByText(/Confirmed against the parish ledger/)).toBeVisible();
});

test("admins can change a member's role, revoke invites, and remove members", async () => {
  // Promote the viewer to editor; the member row is scoped by email.
  await ownerPage.goto(`/trees/${treeId}/settings`);
  const memberRow = ownerPage.locator("li").filter({ hasText: MEMBER.email });
  await memberRow.locator('select[name="role"]').selectOption("editor");
  await memberRow.getByRole("button", { name: "Update" }).click();
  await expect(memberRow.locator('select[name="role"]')).toHaveValue("editor");

  // The promotion is live: the member now sees editor affordances.
  await memberPage.goto(`/trees/${treeId}/people?scope=all`);
  await expect(memberPage.getByRole("link", { name: "Add person" })).toBeVisible();

  // A revoked invite link no longer offers registration.
  const revokableToken = await createInvite(ownerPage, treeId, "contributor");
  const inviteRow = ownerPage.locator("li").filter({ hasText: revokableToken });
  await inviteRow.getByRole("button", { name: "Revoke" }).click();
  await expect(ownerPage.locator("li").filter({ hasText: revokableToken })).toHaveCount(0);
  const strangerPage = await (await ownerPage.context().browser()!.newContext()).newPage();
  await strangerPage.goto(`/invite/${revokableToken}`);
  await expect(strangerPage.getByRole("button", { name: "Create account and join" })).toHaveCount(
    0,
  );
  await strangerPage.context().close();

  // Removing the member revokes access immediately.
  await ownerPage.goto(`/trees/${treeId}/settings`);
  await ownerPage
    .locator("li")
    .filter({ hasText: MEMBER.email })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(ownerPage.locator("li").filter({ hasText: MEMBER.email })).toHaveCount(0);
  const denied = await memberPage.goto(`/trees/${treeId}/people`);
  expect(denied?.status()).toBe(404);
});

test("deleting a person soft-deletes: gone from lists, search, and direct URLs", async () => {
  await ownerPage.goto(`/trees/${treeId}/people?scope=all&q=Cordelia`);
  await ownerPage.getByRole("link", { name: /Cordelia Winslow/ }).click();
  await ownerPage.getByRole("link", { name: "View profile" }).click();
  await ownerPage.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  const personUrl = ownerPage.url();

  await ownerPage.getByRole("link", { name: "Edit" }).click();
  await ownerPage.waitForURL(/\/edit$/);
  await ownerPage.getByRole("button", { name: "Delete Cordelia Winslow" }).click();
  await ownerPage.waitForURL(new RegExp(`/trees/${treeId}/people$`));

  await ownerPage.goto(`/trees/${treeId}/people?scope=all`);
  await expect(ownerPage.getByRole("link", { name: /Cordelia Winslow/ })).toHaveCount(0);
  await ownerPage.goto(`/trees/${treeId}/search?q=Cordelia&scope=all`);
  await expect(ownerPage.getByRole("link", { name: /Cordelia Winslow/ })).toHaveCount(0);
  const gone = await ownerPage.goto(personUrl);
  expect(gone?.status()).toBe(404);
});

test("deleting media soft-deletes it out of the library", async () => {
  const mediaId = await uploadMedia(ownerPage, treeId, "gov-photo.png", "image/png", samplePng());
  await ownerPage.goto(`/trees/${treeId}/media/${mediaId}`);
  await ownerPage.locator('summary[title="More options"]').click();
  await ownerPage.getByText("Delete…", { exact: true }).click();
  await ownerPage.getByRole("button", { name: "Delete permanently from library" }).click();
  await ownerPage.waitForURL(new RegExp(`/trees/${treeId}/media$`));

  await ownerPage.goto(`/trees/${treeId}/media?scope=all`);
  await expect(ownerPage.locator(`a[href*="${mediaId}"]`)).toHaveCount(0);
  const gone = await ownerPage.goto(`/trees/${treeId}/media/${mediaId}`);
  expect(gone?.status()).toBe(404);
});
