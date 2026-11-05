import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";

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
 * Account settings and the Owner's user management, through the real controls. Passes
 * with or without SMTP: reset links come from the Owner's page here, not from email.
 * All data fictional.
 */
test.describe.configure({ mode: "serial" });

/** Updated as the tests change these credentials. */
const member = {
  name: "Odalys Marchbank",
  email: "account-odalys@example.test",
  password: "account-password-1",
};
const ARCHIVE_ADMIN = {
  name: "Perpetua Lindqvist",
  email: "account-perpetua@example.test",
  password: "account-password-2",
};
const CONTRIBUTOR = {
  name: "Tobias Quillfeather",
  email: "account-tobias@example.test",
  password: "account-password-3",
};
const GUESSED = {
  name: "Ignatius Fernwood",
  email: "account-ignatius@example.test",
  password: "account-password-4",
};

const THROTTLED = {
  name: "Cordelia Ashgrove",
  email: "account-cordelia@example.test",
  password: "account-password-5",
};

let ownerPage: Page;
let treeId: string;
/** The member's first browser, and a second one standing in for another device. */
let memberPage: Page;
let otherDevice: Page;
let archiveAdminPage: Page;

const closers: (() => Promise<void>)[] = [];

async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  closers.push(() => context.close());
  return context.newPage();
}

async function signInFresh(browser: Browser, email: string, password: string): Promise<Page> {
  const page = await freshPage(browser);
  await login(page, email, password);
  return page;
}

async function isSignedIn(page: Page): Promise<boolean> {
  await page.goto("/trees");
  return !new URL(page.url()).pathname.startsWith("/login");
}

async function expectSignInRefused(browser: Browser, email: string, password: string) {
  const page = await freshPage(browser);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/error=/);
}

async function submitEmailChange(page: Page, email: string, currentPassword: string) {
  await page.goto("/account");
  const form = page.getByRole("form", { name: "Change email" });
  await form.getByLabel("New email").fill(email);
  await form.getByLabel("Current password").fill(currentPassword);
  await form.getByRole("button", { name: "Change email" }).click();
}

async function submitPasswordChange(page: Page, current: string, next: string, repeat = next) {
  await page.goto("/account");
  const form = page.getByRole("form", { name: "Change password" });
  await form.getByLabel("Current password").fill(current);
  await form.getByLabel("New password (min. 8 characters)").fill(next);
  await form.getByLabel("Repeat new password").fill(repeat);
  await form.getByRole("button", { name: "Change password" }).click();
}

function userRow(page: Page, email: string): Locator {
  return page.getByRole("listitem").filter({ hasText: email });
}

function resetLinkButton(page: Page, name: string): Locator {
  return page.getByRole("button", { name: `Create reset link for ${name}` });
}

function resetLinkField(page: Page, name: string): Locator {
  return page.getByRole("textbox", { name: `Password reset link for ${name}` });
}

/** Creates a link through the Owner's page; returns its path, to open on any stack. */
async function createResetLink(name: string): Promise<string> {
  await ownerPage.goto("/admin/users");
  await resetLinkButton(ownerPage, name).click();
  const field = resetLinkField(ownerPage, name);
  await expect(field).toBeVisible();
  const url = await field.inputValue();
  expect(url).toMatch(/\/reset-password\?token=[0-9a-f]{64}$/);
  const { pathname, search } = new URL(url);
  return pathname + search;
}

/** A string because this project compiles without the DOM types. */
function readClipboard(page: Page): Promise<string> {
  return page.evaluate<string>("navigator.clipboard.readText()");
}

async function expectLinkDead(browser: Browser, link: string) {
  const page = await freshPage(browser);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "This link is no longer valid" })).toBeVisible();
}

async function removeAccount(email: string) {
  await ownerPage.goto("/admin/users");
  const row = userRow(ownerPage, email);
  await row.locator("summary", { hasText: "Remove account" }).click();
  await row.getByLabel(`Type ${email} to confirm`).fill(email);
  await row.getByRole("button", { name: "Remove account" }).click();
  await ownerPage.waitForURL(/removed=1/);
  await expect(userRow(ownerPage, email)).toHaveCount(0);
}

interface CapturedAction {
  actionId: string;
  contentType: string;
  body: Buffer;
}

/** Records the Server Action request that `act` sends from the Owner's page. */
async function captureAction(act: () => Promise<void>): Promise<CapturedAction> {
  const [request] = await Promise.all([
    ownerPage.waitForRequest(
      (candidate) =>
        candidate.method() === "POST" && new URL(candidate.url()).pathname === "/admin/users",
    ),
    act(),
  ]);
  return {
    actionId: request.headers()["next-action"]!,
    contentType: request.headers()["content-type"]!,
    body: request.postDataBuffer()!,
  };
}

function replayAction(request: APIRequestContext, action: CapturedAction, body = action.body) {
  return request.post("/admin/users", {
    headers: { "next-action": action.actionId, "content-type": action.contentType },
    data: body,
    maxRedirects: 0,
  });
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  closers.push(() => context.close());
  ownerPage = await context.newPage();
  await login(ownerPage, OWNER.email, OWNER.password);
  treeId = await createArchive(ownerPage, "Account Probe Archive");

  const memberToken = await createInvite(ownerPage, treeId, "viewer");
  const memberContext = await registerViaInvite(browser, memberToken, member, treeId);
  closers.push(() => memberContext.close());
  memberPage = await memberContext.newPage();
  otherDevice = await signInFresh(browser, member.email, member.password);

  const adminToken = await createInvite(ownerPage, treeId, "admin");
  const adminContext = await registerViaInvite(browser, adminToken, ARCHIVE_ADMIN, treeId);
  closers.push(() => adminContext.close());
  archiveAdminPage = await adminContext.newPage();
});

test.afterAll(async () => {
  for (const close of closers) await close();
});

test("changing a name or an email keeps every session", async ({ browser }) => {
  // The message keys come from the URL, and Object has a "constructor" of its own.
  await memberPage.goto("/account?error=constructor&saved=constructor");
  await expect(memberPage.getByRole("heading", { name: "Account settings" })).toBeVisible();

  await memberPage.goto("/account");
  const nameForm = memberPage.getByRole("form", { name: "Change name" });
  await nameForm.getByLabel("Your name").fill("Odalys Marchbank-Reed");
  await nameForm.getByRole("button", { name: "Save name" }).click();
  await memberPage.waitForURL(/saved=name/);
  member.name = "Odalys Marchbank-Reed";
  await expect(memberPage.locator("summary", { hasText: member.name })).toBeVisible();
  expect(await isSignedIn(otherDevice)).toBe(true);

  await submitEmailChange(memberPage, "account-odalys-2@example.test", "not-the-password");
  await memberPage.waitForURL(/error=wrong/);
  await expect(memberPage.getByText("Your current password wasn't right.")).toBeVisible();

  await submitEmailChange(memberPage, OWNER.email, member.password);
  await memberPage.waitForURL(/error=taken/);
  await expect(
    memberPage.getByText("That email address belongs to another account."),
  ).toBeVisible();

  const oldEmail = member.email;
  // Stored the way registration stores it, whatever was typed.
  await submitEmailChange(memberPage, "Account-Odalys-2@Example.TEST", member.password);
  await memberPage.waitForURL(/saved=email/);
  member.email = "account-odalys-2@example.test";
  await expect(memberPage.locator("strong", { hasText: member.email })).toBeVisible();

  expect(await isSignedIn(memberPage)).toBe(true);
  expect(await isSignedIn(otherDevice)).toBe(true);
  await expectSignInRefused(browser, oldEmail, member.password);
  await signInFresh(browser, member.email, member.password);
});

test("changing a password keeps this session and signs out the others", async ({ browser }) => {
  const oldPassword = member.password;
  const newPassword = "account-password-1b";

  await submitPasswordChange(memberPage, "not-the-password", newPassword);
  await memberPage.waitForURL(/error=wrong/);
  await submitPasswordChange(memberPage, oldPassword, newPassword, "a-different-password");
  await memberPage.waitForURL(/error=mismatch/);
  await submitPasswordChange(memberPage, oldPassword, oldPassword);
  await memberPage.waitForURL(/error=samePassword/);
  expect(await isSignedIn(otherDevice)).toBe(true);

  const stamped = (await (await otherDevice.request.get("/api/auth/session")).json()) as {
    credentialsStamp: number;
  };

  await submitPasswordChange(memberPage, oldPassword, newPassword);
  await memberPage.waitForURL(/saved=password/);
  member.password = newPassword;
  expect(await isSignedIn(memberPage)).toBe(true);
  expect(await isSignedIn(otherDevice)).toBe(false);

  // The update trigger is reachable by anyone holding a token, so a revoked one must
  // not be able to use it to stamp itself current again.
  const { csrfToken } = (await (await otherDevice.request.get("/api/auth/csrf")).json()) as {
    csrfToken: string;
  };
  const revive = await otherDevice.request.post("/api/auth/session", {
    data: { csrfToken, data: {} },
  });
  expect(revive.ok()).toBe(true);
  const revived = (await revive.json()) as { credentialsStamp: number };
  expect(revived.credentialsStamp).toBe(stamped.credentialsStamp);
  expect(await isSignedIn(otherDevice)).toBe(false);

  await expectSignInRefused(browser, member.email, oldPassword);
  otherDevice = await signInFresh(browser, member.email, member.password);
});

test("a password or email change burns an outstanding reset link", async ({ browser }) => {
  const beforePasswordChange = await createResetLink(member.name);
  const newPassword = "account-password-1c";
  await submitPasswordChange(memberPage, member.password, newPassword);
  await memberPage.waitForURL(/saved=password/);
  member.password = newPassword;
  await expectLinkDead(browser, beforePasswordChange);

  const beforeEmailChange = await createResetLink(member.name);
  await submitEmailChange(memberPage, "account-odalys-3@example.test", member.password);
  await memberPage.waitForURL(/saved=email/);
  member.email = "account-odalys-3@example.test";
  await expectLinkDead(browser, beforeEmailChange);
});

test("only the Owner can reach user management", async ({ browser }) => {
  const anonymous = await freshPage(browser);
  await anonymous.goto("/admin/users");
  await anonymous.waitForURL(/\/login/);
  await anonymous.goto("/account");
  await anonymous.waitForURL(/\/login/);

  // An archive Admin is not the instance Owner.
  const notFound = await archiveAdminPage.goto("/admin/users");
  expect(notFound?.status()).toBe(404);
  await archiveAdminPage.goto("/trees");
  await archiveAdminPage.locator("summary", { hasText: ARCHIVE_ADMIN.name }).click();
  await expect(archiveAdminPage.getByRole("link", { name: "Account settings" })).toBeVisible();
  await expect(archiveAdminPage.getByRole("link", { name: "Manage users" })).toHaveCount(0);

  // A page returning 404 doesn't stop anyone posting to its actions, so replay the
  // Owner's real requests with other people's cookies.
  await ownerPage.goto("/admin/users");
  const resetLink = await captureAction(() => resetLinkButton(ownerPage, member.name).click());
  await expect(resetLinkField(ownerPage, member.name)).toBeVisible();

  // The Owner replaying it shows the replay itself is a working request.
  const asOwner = await replayAction(ownerPage.request, resetLink);
  expect(asOwner.ok()).toBe(true);
  expect(await asOwner.text()).toContain("/reset-password?token=");

  for (const caller of [archiveAdminPage.request, anonymous.request]) {
    const refused = await replayAction(caller, resetLink);
    expect(refused.ok()).toBe(false);
    expect(await refused.text()).not.toContain("/reset-password?token=");
  }

  const row = userRow(ownerPage, member.email);
  const memberId = await row.locator('input[name="userId"]').first().inputValue();
  await row.locator("summary", { hasText: "Remove account" }).click();
  await row.getByLabel(`Type ${member.email} to confirm`).fill("wrong-address@example.test");
  const removal = await captureAction(() =>
    row.getByRole("button", { name: "Remove account" }).click(),
  );
  await ownerPage.waitForURL(/error=mismatch/);
  await expect(userRow(ownerPage, member.email)).toBeVisible();

  const properlyConfirmed = Buffer.from(
    removal.body.toString().replace("wrong-address@example.test", member.email),
  );
  for (const caller of [archiveAdminPage.request, anonymous.request]) {
    const refused = await replayAction(caller, removal, properlyConfirmed);
    expect(refused.ok()).toBe(false);
  }
  await signInFresh(browser, member.email, member.password);

  // The Owner's own account has no controls, and the server refuses it anyway.
  await ownerPage.goto("/admin/users");
  const ownerRow = userRow(ownerPage, OWNER.email);
  await expect(ownerRow.getByText("All archives")).toBeVisible();
  await expect(ownerRow.locator("summary")).toHaveCount(0);
  await expect(ownerRow.getByRole("button")).toHaveCount(0);

  const { user } = (await (await ownerPage.request.get("/api/auth/session")).json()) as {
    user: { id: string };
  };
  const resetSelf = await replayAction(
    ownerPage.request,
    resetLink,
    Buffer.from(resetLink.body.toString().replace(memberId, user.id)),
  );
  expect(resetSelf.ok()).toBe(true);
  const resetSelfBody = await resetSelf.text();
  expect(resetSelfBody).toContain("Change your own password in Account settings.");
  expect(resetSelfBody).not.toContain("/reset-password?token=");

  const removeSelf = await replayAction(
    ownerPage.request,
    removal,
    Buffer.from(
      removal.body
        .toString()
        .replace(memberId, user.id)
        .replace("wrong-address@example.test", OWNER.email),
    ),
  );
  expect(removeSelf.headers()["x-action-redirect"]).toContain("error=owner");
  await signInFresh(browser, OWNER.email, OWNER.password);
});

test("a reset link from the Owner works once and ends the person's sessions", async ({
  browser,
}) => {
  await ownerPage.goto("/admin/users");
  await resetLinkButton(ownerPage, member.name).click();
  const field = resetLinkField(ownerPage, member.name);
  await expect(field).toBeVisible();
  const url = await field.inputValue();

  // A token in the address would stay in browser history and proxy logs.
  expect(ownerPage.url()).not.toContain("token");

  await userRow(ownerPage, member.email).getByRole("button", { name: "Copy link" }).click();
  await expect(userRow(ownerPage, member.email).getByText("Copied")).toBeVisible();
  expect(await readClipboard(ownerPage)).toBe(url);

  const { pathname, search } = new URL(url);
  const link = pathname + search;
  const page = await freshPage(browser);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await expect(page.getByText(`For ${member.email}`)).toBeVisible();
  const oldPassword = member.password;
  const newPassword = "account-password-1d";
  await page.getByLabel("New password (min. 8 characters)").fill(newPassword);
  await page.getByLabel("Repeat new password").fill(newPassword);
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.waitForURL(/\/login\?reset=1/);
  member.password = newPassword;

  expect(await isSignedIn(memberPage)).toBe(false);
  expect(await isSignedIn(otherDevice)).toBe(false);
  await expectSignInRefused(browser, member.email, oldPassword);
  memberPage = await signInFresh(browser, member.email, member.password);
  await expectLinkDead(browser, link);
});

test("Copy link still works where navigator.clipboard doesn't exist", async () => {
  // A plain HTTP address has no navigator.clipboard, and that's a common self-hosted
  // setup. Test on a separate tab so the check below can still read the clipboard.
  const tab = await ownerPage.context().newPage();
  await tab.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined });
  });
  await tab.goto("/admin/users");
  await resetLinkButton(tab, member.name).click();
  const field = resetLinkField(tab, member.name);
  await expect(field).toBeVisible();
  const url = await field.inputValue();

  await userRow(tab, member.email).getByRole("button", { name: "Copy link" }).click();
  await expect(userRow(tab, member.email).getByText("Copied")).toBeVisible();
  await tab.close();

  await ownerPage.bringToFront();
  expect(await readClipboard(ownerPage)).toBe(url);
});

test("a reset link opened while signed in explains itself", async () => {
  const link = await createResetLink(member.name);

  await memberPage.goto(link);
  await expect(
    memberPage.getByRole("heading", { name: "Sign out to use this link" }),
  ).toBeVisible();
  await expect(memberPage.getByText(`You're signed in as ${member.email}`)).toBeVisible();

  await memberPage.getByRole("button", { name: "Sign out and continue" }).click();
  await expect(memberPage.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await expect(memberPage.getByText(`For ${member.email}`)).toBeVisible();
  expect(await isSignedIn(memberPage)).toBe(false);
});

test("removing an account keeps what the person added", async ({ browser }) => {
  const invite = await createInvite(ownerPage, treeId, "contributor");
  const context = await registerViaInvite(browser, invite, CONTRIBUTOR, treeId);
  closers.push(() => context.close());
  const page = await context.newPage();

  const mediaId = await uploadMedia(page, treeId, "quillfeather.png", "image/png", samplePng());
  const suggestion = "The christening was in Thornbury, not Dunwich.";
  await page.goto(`/trees/${treeId}/suggestions`);
  await page.getByText("Suggest a correction", { exact: true }).click();
  await page.getByLabel("What should change?").fill(suggestion);
  await page.getByRole("button", { name: "Send suggestion" }).click();
  await page.waitForURL(/suggested=1/);

  await ownerPage.goto("/admin/users");
  const row = userRow(ownerPage, CONTRIBUTOR.email);
  await expect(row.getByRole("link", { name: "Account Probe Archive" })).toBeVisible();
  await expect(row.getByText("contributor")).toBeVisible();

  await removeAccount(CONTRIBUTOR.email);

  expect(await isSignedIn(page)).toBe(false);
  await expectSignInRefused(browser, CONTRIBUTOR.email, CONTRIBUTOR.password);

  await ownerPage.goto(`/trees/${treeId}/media/${mediaId}`);
  // Inside the page's collapsed details section.
  await expect(ownerPage.getByText(/by\s+unknown/)).toBeAttached();

  await ownerPage.goto(`/trees/${treeId}/suggestions`);
  await expect(ownerPage.getByText(suggestion)).toBeVisible();
  await expect(ownerPage.getByText("A former member")).toBeVisible();

  // Not "system": that would pin what they did on nobody.
  await ownerPage.goto(`/trees/${treeId}/settings/audit`);
  const uploadEntry = ownerPage.getByRole("row").filter({ hasText: "media.uploaded" });
  await expect(uploadEntry.getByText(`${CONTRIBUTOR.name} (removed)`)).toBeVisible();
  await expect(
    ownerPage.getByText(`Removed the account of ${CONTRIBUTOR.name} (${CONTRIBUTOR.email})`),
  ).toBeVisible();

  // The address is free again, as a new account.
  const comeback = await createInvite(ownerPage, treeId, "viewer");
  const returned = await registerViaInvite(browser, comeback, CONTRIBUTOR, treeId);
  await returned.close();
});

test("removing an archive's only admin warns, and revokes their invite links", async ({
  browser,
}) => {
  const ownArchive = await createArchive(archiveAdminPage, "Lindqvist Branch Archive");
  const theirInvite = await createInvite(archiveAdminPage, ownArchive, "viewer");

  await ownerPage.goto(`/trees/${treeId}/settings`);
  await ownerPage
    .locator('form:has([name="expiresInDays"]) select[name="role"]')
    .selectOption("viewer");
  await ownerPage.getByLabel("Email to (optional)").fill(ARCHIVE_ADMIN.email);
  await ownerPage.getByRole("button", { name: "Create invite" }).click();
  await ownerPage.waitForURL(/invite=/);
  const inviteSentToThem = new URL(ownerPage.url()).searchParams.get("invite")!;
  const unrelatedInvite = await createInvite(ownerPage, treeId, "viewer");

  await ownerPage.goto("/admin/users");
  const row = userRow(ownerPage, ARCHIVE_ADMIN.email);
  await row.locator("summary", { hasText: "Remove account" }).click();
  await expect(row.getByText(/only admin of Lindqvist Branch Archive/)).toBeVisible();
  // They aren't the only admin of the Owner's archive, so it isn't named.
  await expect(row.getByText(/only admin of .*Account Probe Archive/)).toHaveCount(0);

  await removeAccount(ARCHIVE_ADMIN.email);

  const anonymous = await freshPage(browser);
  for (const token of [theirInvite, inviteSentToThem]) {
    await anonymous.goto(`/invite/${token}`);
    await expect(anonymous.getByRole("heading", { name: "Invite not valid" })).toBeVisible();
  }
  await anonymous.goto(`/invite/${unrelatedInvite}`);
  await expect(anonymous.getByRole("heading", { name: /^Join/ })).toBeVisible();

  // The archive they ran is still there for the Owner, with the removal on record.
  await ownerPage.goto(`/trees/${ownArchive}/settings/audit`);
  await expect(
    ownerPage.getByText(
      `Removed the account of ${ARCHIVE_ADMIN.name} (${ARCHIVE_ADMIN.email}) and revoked 1 invite link`,
    ),
  ).toBeVisible();
});

test("guesses at the current password are throttled without blocking sign-in", async ({
  browser,
}) => {
  const invite = await createInvite(ownerPage, treeId, "viewer");
  const context = await registerViaInvite(browser, invite, GUESSED, treeId);
  closers.push(() => context.close());
  const page = await context.newPage();

  let throttledAt = 0;
  // The limit is 10 per 15 minutes; stop well short of a runaway loop.
  for (let attempt = 1; attempt <= 15 && throttledAt === 0; attempt++) {
    await submitEmailChange(page, "account-ignatius-2@example.test", "not-the-password");
    await page.waitForURL(/error=/);
    if (page.url().includes("error=throttled")) throttledAt = attempt;
  }
  expect(throttledAt, "the current-password check was never throttled").toBeGreaterThan(3);
  await expect(page.getByText("Too many attempts. Try again in a few minutes.")).toBeVisible();

  // The right password is refused too until the window ends, but sign-in has its own count.
  await submitEmailChange(page, "account-ignatius-2@example.test", GUESSED.password);
  await page.waitForURL(/error=throttled/);
  await signInFresh(browser, GUESSED.email, GUESSED.password);
});

test("a password change still lands safely when the sign-in limiter refuses the new session", async ({
  browser,
}) => {
  const invite = await createInvite(ownerPage, treeId, "viewer");
  const context = await registerViaInvite(browser, invite, THROTTLED, treeId);
  closers.push(() => context.close());
  const page = await context.newPage();

  // Someone else hammering this address on the sign-in form.
  const attacker = await freshPage(browser);
  let throttled = false;
  for (let attempt = 1; attempt <= 15 && !throttled; attempt++) {
    await attacker.goto("/login");
    await attacker.getByLabel("Email").fill(THROTTLED.email);
    await attacker.getByLabel("Password").fill("not-the-password");
    await attacker.getByRole("button", { name: "Sign in" }).click();
    await attacker.waitForURL(/error=/);
    throttled = attacker.url().includes("error=ratelimited");
  }
  expect(throttled, "sign-in was never throttled").toBe(true);

  await submitPasswordChange(page, THROTTLED.password, "account-password-5b");
  await page.waitForURL(/\/login\?reset=1/);
  await expect(page.getByText("Your password has been changed")).toBeVisible();
  expect(await isSignedIn(page)).toBe(false);
});

test("the forgot-password page describes the path this server offers", async ({ browser }) => {
  const page = await freshPage(browser);
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  if ((await page.getByRole("button", { name: "Send reset link" }).count()) === 0) {
    await expect(page.getByText("Manage users")).toBeVisible();
    await expect(page.getByText("Accounts and passwords")).toBeVisible();
  }
});
