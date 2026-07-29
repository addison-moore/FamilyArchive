import { expect, test, type Page } from "@playwright/test";

import { createArchive, createInvite, login, OWNER, registerViaInvite } from "./helpers";

/**
 * Password reset end-to-end via the emailed link (PRD §7). Reset tokens are
 * stored hashed, so the only way to exercise the real flow is to capture the
 * email — via the Mailpit SMTP sink (docker/docker-compose.mailpit.yml).
 * Auto-skips when Mailpit isn't running. All data fictional (§1.5).
 */
test.describe.configure({ mode: "serial" });

const MAILPIT = "http://localhost:8025";
const RESET_USER = {
  name: "Rowena Thistle",
  email: "reset-tester@example.test",
  password: "reset-password-old",
};
const NEW_PASSWORD = "reset-password-new";

let mailpitUp = false;
let ownerPage: Page;

test.beforeAll(async ({ browser }) => {
  ownerPage = await browser.newPage();
  try {
    mailpitUp = (await ownerPage.request.get(`${MAILPIT}/api/v1/messages`)).ok();
  } catch {
    mailpitUp = false;
  }
});

test.afterAll(async () => {
  await ownerPage.close();
});

test("password reset works end-to-end through the emailed link", async ({ browser }) => {
  test.skip(!mailpitUp, "Mailpit not running — start the mailpit compose override");
  test.setTimeout(180_000);

  // A dedicated account keeps the owner's credentials untouched for later specs.
  await login(ownerPage, OWNER.email, OWNER.password);
  const treeId = await createArchive(ownerPage, "Reset Probe Archive");
  const token = await createInvite(ownerPage, treeId, "viewer");
  const userContext = await registerViaInvite(browser, token, RESET_USER, treeId);
  await userContext.close();

  const page = await (await browser.newContext()).newPage();
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await page.getByLabel("Email").fill(RESET_USER.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.waitForURL(/sent=1/);
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  // The worker delivers asynchronously — poll Mailpit for the message.
  let resetUrl: string | null = null;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !resetUrl) {
    const search = await page.request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${RESET_USER.email}`)}`,
    );
    const { messages } = (await search.json()) as { messages: { ID: string; Subject: string }[] };
    const mail = messages.find((m) => m.Subject === "Reset your FamilyArchive password");
    if (mail) {
      const detail = await page.request.get(`${MAILPIT}/api/v1/message/${mail.ID}`);
      const { Text } = (await detail.json()) as { Text: string };
      resetUrl = Text.match(/\/reset-password\?token=[0-9a-f]{64}/)?.[0] ?? null;
    }
    if (!resetUrl) await page.waitForTimeout(2_000);
  }
  expect(resetUrl, "reset email never arrived in Mailpit").toBeTruthy();

  await page.goto(resetUrl!);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await expect(page.getByText(`For ${RESET_USER.email}`)).toBeVisible();
  await page.getByLabel("New password (min. 8 characters)").fill(NEW_PASSWORD);
  await page.getByLabel("Repeat new password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.waitForURL(/\/login\?reset=1/);

  // The old password is dead, the new one works, and the link is single-use.
  await page.getByLabel("Email").fill(RESET_USER.email);
  await page.getByLabel("Password").fill(RESET_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/error=1/);

  await login(page, RESET_USER.email, NEW_PASSWORD);

  await page.context().clearCookies();
  await page.goto(resetUrl!);
  await expect(page.getByRole("heading", { name: "This link is no longer valid" })).toBeVisible();
  await page.context().close();
});
