/**
 * Captures the marketing-site product screenshots from a running FamilyArchive
 * instance into apps/site/public/screenshots/ (light + dark variants).
 *
 * This is a manual pre-release step, not CI: rerun it and commit the refreshed
 * PNGs whenever the app UI changes materially.
 *
 * Preconditions:
 *   - The full stack is running (default http://localhost:3000) with fictional
 *     sample data loaded (PRD §1.5 — the signed-in account shown in the header
 *     must be fictional too; never capture as a real owner account).
 *   - The account has at least viewer access to the archive being captured.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 \
 *   EMAIL=vera@example.com PASSWORD=... \
 *   TREE_ID=<archive id> PERSON_ID=<person id> MEDIA_ID=<document id> \
 *   node tests/smoke/scripts/capture-site-screenshots.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const { EMAIL, PASSWORD, TREE_ID, PERSON_ID, MEDIA_ID } = process.env;
if (!EMAIL || !PASSWORD || !TREE_ID || !PERSON_ID || !MEDIA_ID) {
  console.error("Set EMAIL, PASSWORD, TREE_ID, PERSON_ID and MEDIA_ID (see header comment).");
  process.exit(1);
}

const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../apps/site/public/screenshots",
);

const SHOTS = [
  { name: "tree-canvas", url: `/trees/${TREE_ID}`, waitFor: ".react-flow__node" },
  { name: "media-library", url: `/trees/${TREE_ID}/media`, waitFor: "main img" },
  { name: "media-lightbox", url: `/trees/${TREE_ID}/media/${MEDIA_ID}`, waitFor: "main img" },
  { name: "person-profile", url: `/trees/${TREE_ID}/people/${PERSON_ID}`, waitFor: "main h1" },
];

async function settle(page) {
  await page.waitForLoadState("networkidle");
  // Let images decode and React Flow finish its fit-view animation.
  await page.waitForTimeout(1200);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

console.log(`Signing in as ${EMAIL}…`);
await page.goto(`${BASE_URL}/login`);
await page.getByLabel("Email").fill(EMAIL);
await page.getByLabel("Password").fill(PASSWORD);
await page.getByRole("button", { name: /sign in/i }).click();
await page.waitForURL((url) => !url.pathname.startsWith("/login"));

for (const shot of SHOTS) {
  await page.goto(`${BASE_URL}${shot.url}`);
  await page.waitForSelector(shot.waitFor);
  await settle(page);
  for (const variant of ["light", "dark"]) {
    // The app themes entirely through CSS variables keyed off `.dark` on
    // <html>, so toggling the class client-side is enough for capture.
    await page.evaluate((v) => {
      document.documentElement.classList.toggle("dark", v === "dark");
      document.body.style.colorScheme = v;
    }, variant);
    await page.waitForTimeout(250);
    const file = path.join(OUT_DIR, `${shot.name}-${variant}.png`);
    await page.screenshot({ path: file });
    console.log(`captured ${shot.name}-${variant}.png`);
  }
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.body.style.colorScheme = "light";
  });
}

await browser.close();
console.log(`Done → ${OUT_DIR}`);
