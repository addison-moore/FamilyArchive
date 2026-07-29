import { describe, expect, it } from "vitest";

import { isOcrEligible } from "./ocr";

describe("isOcrEligible (PRD §18.1)", () => {
  it("targets PDFs and scanned documents only", () => {
    expect(isOcrEligible("pdf")).toBe(true);
    expect(isOcrEligible("document")).toBe(true);
    expect(isOcrEligible("photo")).toBe(false);
    expect(isOcrEligible("video")).toBe(false);
    expect(isOcrEligible("audio")).toBe(false);
  });
});
