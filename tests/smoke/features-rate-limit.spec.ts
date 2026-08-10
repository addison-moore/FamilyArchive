import { expect, test, type Page } from "@playwright/test";

import { login, OWNER } from "./helpers";

/**
 * Sign-in throttling. Uses an address that belongs to no account, so tripping
 * the limit cannot lock a user other specs depend on.
 *
 * With TRUST_PROXY_HEADERS off (the default, and what the smoke stack runs),
 * the per-address bound is skipped entirely and only the per-email one applies
 * — which is what makes the count here deterministic regardless of what other
 * specs did before it. All data fictional.
 */
test.describe.configure({ mode: "serial" });

const NOBODY = "throttle-target@example.test";
const WRONG = "not-the-password";

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});

test.afterAll(async () => {
  await page.close();
});

async function attemptSignIn(email: string, password: string): Promise<string> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/login\?/);
  return page.url();
}

test("repeated failed sign-ins are throttled, and the user is told to wait", async () => {
  let throttledAt = 0;
  // The limit is 10 per 15 minutes; stop well short of a runaway loop.
  for (let attempt = 1; attempt <= 15 && throttledAt === 0; attempt++) {
    const url = await attemptSignIn(NOBODY, WRONG);
    if (url.includes("error=ratelimited")) throttledAt = attempt;
  }

  expect(throttledAt, "sign-in was never throttled — is Valkey reachable?").toBeGreaterThan(0);
  // Refused only after several attempts, not on the first one.
  expect(throttledAt).toBeGreaterThan(3);
  await expect(page.getByText(/Too many sign-in attempts/)).toBeVisible();
  // The message tells the user when to come back rather than just refusing.
  await expect(page.getByText(/Try again in/)).toBeVisible();
});

test("the throttle is scoped to the address that tripped it", async () => {
  // A different account must still be able to sign in — otherwise one attacker
  // hammering a known address could lock out the whole instance.
  await login(page, OWNER.email, OWNER.password);
  await expect(page).toHaveURL(/\/trees/);
});
