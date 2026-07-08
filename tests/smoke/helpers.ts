import { deflateSync } from "node:zlib";

import type { Page } from "@playwright/test";

/** All smoke data is fictional (PRD §1.5). */
export const OWNER = {
  name: "Smoke Owner",
  email: "smoke-owner@example.test",
  password: "smoke-password-1",
};

export const INVITEE = {
  name: "Smoke Editor",
  email: "smoke-editor@example.test",
  password: "smoke-password-2",
};

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/trees/);
}

/** Minimal valid one-page PDF with real (Helvetica) text for the OCR job. */
export function samplePdf(lines: string[]): Buffer {
  const stream = lines
    .map((line, index) => `BT /F1 24 Tf 72 ${700 - index * 40} Td (${line}) Tj ET`)
    .join(" ");
  const pdf =
    `%PDF-1.4\n` +
    `1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n` +
    `2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
    `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]` +
    `/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n` +
    `4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n` +
    `5 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream endobj\n` +
    `trailer<</Root 1 0 R>>\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/**
 * Portrait with a detectable face for the face-detection job. Downloaded at
 * runtime from MediaPipe's Apache-2.0 test assets so the repository ships no
 * real-person photo (PRD §1.5).
 */
export async function fetchPortrait(): Promise<Buffer> {
  const response = await fetch("https://storage.googleapis.com/mediapipe-assets/portrait.jpg");
  if (!response.ok) throw new Error(`portrait download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Tiny valid PNG (solid warm gray) for the thumbnail job. */
export function samplePng(): Buffer {
  const width = 64;
  const height = 48;
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (tag: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(tag, "ascii"), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  const raw = Buffer.concat(
    Array.from({ length: height }, () =>
      Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x9a)]),
    ),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const SAMPLE_GEDCOM = `0 HEAD
1 SOUR FamilyArchive-Smoke
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Wilhelmina /Fairweather/
1 SEX F
1 BIRT
2 DATE 1901
2 PLAC Dunwich, England
0 @I2@ INDI
1 NAME Bartholomew /Fairweather/
1 SEX M
1 BIRT
2 DATE 1899
0 @I3@ INDI
1 NAME Clementine /Fairweather/
1 SEX F
1 BIRT
2 DATE 1925
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I1@
1 CHIL @I3@
1 MARR
0 TRLR
`;
