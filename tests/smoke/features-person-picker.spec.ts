import { expect, test, type Page } from "@playwright/test";

import {
  createArchive,
  createInvite,
  login,
  OWNER,
  pickPerson,
  registerViaInvite,
  samplePng,
  submitAction,
  uploadMedia,
} from "./helpers";

/**
 * The person picker through its real control: keyboard, GET and server-action forms,
 * and who may search. The point of the picker is that pages stop carrying the whole
 * archive, so that is asserted too. All data fictional.
 */
test.describe.configure({ mode: "serial" });

const GEDCOM = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Rose /Ashford/
1 BIRT
2 DATE 1880
1 DEAT
2 DATE 1950
0 @I2@ INDI
1 NAME Rose /Ashford/
1 BIRT
2 DATE 1912
0 @I3@ INDI
1 NAME Rose Mary /Ashford/
0 @I4@ INDI
1 NAME Ambrose /Bell/
0 @I5@ INDI
1 NAME Nora /Pike/
1 NAME Nora /Whitlock/
0 @I6@ INDI
1 NAME Cora /Fifty%Vale/
0 @I7@ INDI
1 NAME Dell_a /Quay/
0 @I8@ INDI
1 NAME Hugo /Marsh/
1 NOTE Hugo kept a private ledger of the harbour tides.
0 TRLR
`;

let page: Page;
let treeId: string;
let hugoProfile: string;
let photoId: string;

const searchUrl = (query: string) =>
  `/api/trees/${treeId}/people/search?q=${encodeURIComponent(query)}`;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await login(page, OWNER.email, OWNER.password);

  await page.goto("/trees/import");
  await page.locator('input[name="file"]').setInputFiles({
    name: "picker.ged",
    mimeType: "text/plain",
    buffer: Buffer.from(GEDCOM, "utf-8"),
  });
  await page.locator('select[name="target"]').selectOption("new");
  await page.locator('input[name="treeName"]').fill("Picker Archive");
  await page.getByRole("button", { name: "Import" }).click();
  await page.waitForURL(/imported=1/);
  treeId = new URL(page.url()).pathname.split("/")[2]!;

  await page.goto(`/trees/${treeId}/people?scope=all&q=Hugo`);
  await page.getByRole("link", { name: /Hugo Marsh/ }).click();
  await page.getByRole("link", { name: "View profile" }).click();
  await page.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  hugoProfile = new URL(page.url()).pathname;
});

test.afterAll(async () => {
  await page.close();
});

test("pages no longer carry people nobody asked for", async () => {
  for (const url of [hugoProfile, `/trees/${treeId}/media`, `/trees/${treeId}/search`]) {
    const html = await (await page.request.get(url)).text();
    expect(html, url).not.toContain("Ambrose");
    expect(html, url).not.toContain("Whitlock");
  }
});

test("search matches words in any order and alternate names, best matches first", async () => {
  const names = async (query: string) => {
    const response = await page.request.get(searchUrl(query));
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { people: { fullName: string }[] };
    return body.people.map((person) => person.fullName);
  };
  expect(await names("rose ashford")).toEqual([
    "Rose Ashford",
    "Rose Ashford",
    "Rose Mary Ashford",
  ]);
  expect(await names("ashford mary")).toEqual(["Rose Mary Ashford"]);
  expect(await names("Whitlock")).toEqual(["Nora Pike"]);
  // A word start beats the same letters inside a name, despite sorting later.
  expect((await names("rose")).at(-1)).toBe("Ambrose Bell");
  // Wildcards are text.
  expect(await names("%")).toEqual(["Cora Fifty%Vale"]);
  expect(await names("_")).toEqual(["Dell_a Quay"]);
  expect(await names("zzz")).toEqual([]);
});

test("the search sends only names and lifespans, and can leave people out", async () => {
  const response = await page.request.get(searchUrl("hugo"));
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = (await response.json()) as { people: { id: string }[]; hasMore: boolean };
  expect(body.hasMore).toBe(false);
  expect(Object.keys(body.people[0]!).sort()).toEqual(["fullName", "id", "lifespan"]);

  const left = await page.request.get(`${searchUrl("hugo")}&exclude=${body.people[0]!.id}`);
  expect(((await left.json()) as { people: unknown[] }).people).toEqual([]);
});

test("a server-action form takes a person chosen by keyboard alone", async () => {
  await page.goto(hugoProfile);
  const addParent = page.locator("details", { hasText: "Add parent" }).first();
  await addParent.locator("summary").focus();
  await page.keyboard.press("Enter");

  const box = addParent.getByRole("combobox", { name: "Person" });
  await box.focus();
  // Tabbing in doesn't open a list; typing does, and highlights the best match.
  await expect(box).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.type("rose as", { delay: 20 });
  await expect(box).toHaveAttribute("aria-expanded", "true");
  const options = addParent.getByRole("listbox", { name: "People" }).getByRole("option");
  await expect(options).toHaveCount(3);
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");

  // People who share a name read differently, so the right one can be chosen.
  await expect(options.nth(0)).toHaveText("Rose Ashford (1880 – 1950)");
  await expect(options.nth(1)).toHaveText("Rose Ashford (b. 1912)");
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  const active = await options.nth(1).getAttribute("id");
  await expect(box).toHaveAttribute("aria-activedescendant", active!);

  // Escape closes the list without choosing; the arrow keys bring it back.
  await page.keyboard.press("Escape");
  await expect(box).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowDown");
  await expect(options).toHaveCount(3);
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");

  // Enter chooses rather than submits, and the box keeps saying who.
  await page.keyboard.press("Enter");
  await expect(box).toHaveValue("Rose Ashford (b. 1912)");
  await expect(box).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(new RegExp(`${hugoProfile}$`));

  // With the list closed, Enter submits the form.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Parents" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Rose Ashford" })).toContainText(
    "b. 1912",
  );
});

test("a person can't be related to themselves through the picker", async () => {
  await page.goto(hugoProfile);
  const addChild = page.locator("details", { hasText: "Add child" }).first();
  await addChild.locator("summary").click();
  await addChild.getByRole("combobox", { name: "Person" }).fill("Hugo");
  await expect(addChild.getByRole("status")).toHaveText("No one matches “Hugo”.");
});

test("a name typed but never chosen can't be submitted", async () => {
  await page.goto(`/trees/${treeId}/media`);
  const box = page.getByRole("combobox", { name: "Filter by person" });
  await box.fill("Rose");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(box).toHaveJSProperty("validationMessage", "Choose a person from the list.");
  expect(new URL(page.url()).search).toBe("");
  // The list comes back to choose from, with focus where the keyboard can use it.
  await expect(box).toBeFocused();
  await expect(box).toHaveAttribute("aria-expanded", "true");
});

test("GET filters submit the id under the same field, and show who after reloading", async () => {
  photoId = await uploadMedia(page, treeId, "ashford.png", "image/png", samplePng());
  await page.goto(`/trees/${treeId}/media/${photoId}`);
  await page.getByText("+ Tag someone").click();
  const person = page.getByRole("combobox", { name: "Person to tag" });
  await pickPerson(person, "Nora");
  await submitAction(
    page,
    page.locator("form", { has: person }).getByRole("button", { name: "Tag" }),
  );
  await expect(page.getByRole("link", { name: "Nora Pike" })).toBeVisible();

  // The form reset after tagging; Nora is on the photo now, so she isn't offered again.
  await expect(person).toHaveValue("");
  await person.fill("Nora");
  await expect(page.locator("form", { has: person }).getByRole("status")).toHaveText(
    "No one matches “Nora”.",
  );

  await page.goto(`/trees/${treeId}/media?scope=all`);
  const filter = page.getByRole("combobox", { name: "Filter by person" });
  await pickPerson(filter, "Nora");
  await page.getByRole("button", { name: "Filter" }).click();
  await page.waitForURL(/[?&]person=[0-9a-f-]{36}/);
  await expect(filter).toHaveValue("Nora Pike");
  await expect(page.getByRole("link", { name: /ashford\.png/ }).first()).toBeVisible();

  // Clearing it means "Anyone" again.
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(filter).toHaveValue("");
  await page.getByRole("button", { name: "Filter" }).click();
  await page.waitForURL(/[?&]person=(&|$)/);

  await page.goto(`/trees/${treeId}/search?q=nora`);
  const searchFilter = page.getByRole("combobox", { name: "Filter by person" });
  await pickPerson(searchFilter, "Nora");
  await page.getByRole("button", { name: "Search" }).click();
  await page.waitForURL(/[?&]person=[0-9a-f-]{36}/);
  await expect(searchFilter).toHaveValue("Nora Pike");
});

test("a new face box takes a person, and a tagged one can be unassigned", async () => {
  await page.goto(`/trees/${treeId}/media/${photoId}`);
  await page.locator(`img[src*="${photoId}"]`).first().click();

  // Typed but not chosen is refused, rather than saved as an untagged box.
  const draft = page.getByRole("combobox", { name: "Who is this?" });
  await expect(draft).toBeFocused();
  await draft.fill("Hugo");
  await page.getByRole("button", { name: "Save tag" }).click();
  await expect(draft).toHaveJSProperty("validationMessage", "Choose a person from the list.");

  await pickPerson(draft, "Hugo");
  await page.getByRole("button", { name: "Save tag" }).click();
  const tagged = page.locator('button[title="Hugo Marsh"]');
  await expect(tagged).toHaveCount(1);

  await tagged.dispatchEvent("click");
  await expect(page.getByText("Tagged as")).toBeVisible();
  await page.getByRole("button", { name: "Unassign" }).click();
  await expect(page.locator('button[title*="Unidentified"]')).toHaveCount(1);
  await expect(tagged).toHaveCount(0);
});

test("only people who can read the archive can search it, and only that archive", async ({
  browser,
}) => {
  const origin = new URL(page.url()).origin;

  // Private: strangers get the same 404 as an archive that doesn't exist.
  const anonymous = await browser.newContext({ baseURL: origin });
  const visitor = await anonymous.newPage();
  expect((await visitor.request.get(searchUrl("rose"))).status()).toBe(404);

  const elsewhere = await createArchive(page, "Picker Elsewhere");
  const token = await createInvite(page, elsewhere, "viewer");
  const memberContext = await registerViaInvite(
    browser,
    token,
    {
      name: "Picker Outsider",
      email: "picker-outsider@example.test",
      password: "picker-pass-1",
    },
    elsewhere,
  );
  const outsider = await memberContext.newPage();
  expect((await outsider.request.get(searchUrl("rose"))).status()).toBe(404);

  // Nobody from this archive turns up searching another one.
  const other = await page.request.get(`/api/trees/${elsewhere}/people/search?q=rose`);
  expect(((await other.json()) as { people: unknown[] }).people).toEqual([]);

  // Public: the search opens to everyone, and the filter works through its real control.
  await page.goto(`/trees/${treeId}/settings`);
  await page.getByLabel("Make this archive publicly viewable").check();
  await submitAction(page, page.getByRole("button", { name: "Save public access" }));
  expect((await visitor.request.get(searchUrl("rose"))).status()).toBe(200);
  expect((await outsider.request.get(searchUrl("rose"))).status()).toBe(200);

  await visitor.goto(`/trees/${treeId}/media`);
  const filter = visitor.getByRole("combobox", { name: "Filter by person" });
  await pickPerson(filter, "Nora");
  await visitor.getByRole("button", { name: "Filter" }).click();
  await visitor.waitForURL(/[?&]person=[0-9a-f-]{36}/);
  await expect(filter).toHaveValue("Nora Pike");

  // Read-only: the photo offers nothing to tag with, and profiles nothing to add.
  await visitor
    .getByRole("link", { name: /ashford\.png/ })
    .first()
    .click();
  await visitor.waitForURL(/\/media\/[0-9a-f-]{36}/);
  await expect(visitor.getByText("+ Tag someone")).toHaveCount(0);
  await expect(visitor.getByRole("combobox")).toHaveCount(0);
  await visitor.goto(hugoProfile);
  await expect(visitor.getByText("Add parent")).toHaveCount(0);

  await page.goto(`/trees/${treeId}/settings`);
  await page.getByLabel("Make this archive publicly viewable").uncheck();
  await submitAction(page, page.getByRole("button", { name: "Save public access" }));
  expect((await visitor.request.get(searchUrl("rose"))).status()).toBe(404);

  await anonymous.close();
  await memberContext.close();
});
