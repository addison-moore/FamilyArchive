import { describe, expect, it } from "vitest";

import { jobsToResume, parseTrashView, trashThumbUrl, trashUrl } from "./trash";

const photo = {
  processingStatus: "processed" as const,
  mediaType: "photo" as const,
  mimeType: "image/png",
  metadata: { faces: { status: "done" } },
};

describe("jobsToResume", () => {
  it("leaves a finished item alone", () => {
    expect(jobsToResume(photo)).toEqual({
      processing: false,
      ocr: false,
      faces: false,
      aiInterrupted: false,
    });
  });

  it("restarts processing that never finished, which continues into OCR and faces itself", () => {
    for (const processingStatus of ["pending", "processing", "retrying"] as const) {
      const jobs = jobsToResume({ ...photo, processingStatus, metadata: {} });
      expect(jobs.processing, processingStatus).toBe(true);
      expect(jobs.faces, processingStatus).toBe(false);
    }
  });

  it("leaves failed processing to the retry the person already has", () => {
    const jobs = jobsToResume({ ...photo, processingStatus: "failed", metadata: {} });
    expect(jobs).toMatchObject({ processing: false, ocr: false, faces: false });
  });

  it("re-runs a text or face job that was skipped while the item was in Trash", () => {
    // Skipped jobs leave no status when they came from the upload chain, and "queued"
    // when someone asked for them from the item's page.
    expect(jobsToResume({ ...photo, metadata: {} }).faces).toBe(true);
    expect(jobsToResume({ ...photo, metadata: { faces: { status: "queued" } } }).faces).toBe(true);

    const pdf = { ...photo, mediaType: "pdf" as const, mimeType: "application/pdf" };
    expect(jobsToResume({ ...pdf, metadata: {} }).ocr).toBe(true);
    expect(jobsToResume({ ...pdf, metadata: { ocr: { status: "running" } } }).ocr).toBe(true);
    expect(jobsToResume({ ...pdf, metadata: { ocr: { status: "done" } } }).ocr).toBe(false);
    expect(jobsToResume({ ...pdf, metadata: { ocr: { status: "failed" } } }).ocr).toBe(false);
  });

  it("doesn't start a job the item isn't eligible for", () => {
    const audio = { ...photo, mediaType: "audio" as const, mimeType: "audio/mpeg", metadata: {} };
    expect(jobsToResume(audio)).toMatchObject({ ocr: false, faces: false });
  });

  it("never re-runs AI cleanup, which would call an external provider unasked", () => {
    for (const status of ["queued", "running"]) {
      const jobs = jobsToResume({ ...photo, metadata: { ai: { status } } });
      expect(jobs.aiInterrupted, status).toBe(true);
    }
    expect(jobsToResume({ ...photo, metadata: { ai: { status: "done" } } }).aiInterrupted).toBe(
      false,
    );
  });
});

describe("parseTrashView", () => {
  it("accepts the three views and defaults to media", () => {
    expect(parseTrashView("people")).toBe("people");
    expect(parseTrashView("merged")).toBe("merged");
    expect(parseTrashView("media")).toBe("media");
    for (const value of [undefined, null, "", "everything", 3]) {
      expect(parseTrashView(value), String(value)).toBe("media");
    }
  });
});

describe("Trash links", () => {
  it("encodes what it carries, including a message with spaces and quotes", () => {
    const url = trashUrl("tree-1", "merged", { error: 'Type "REMOVE" to confirm' });
    expect(url.startsWith("/trees/tree-1/trash?view=merged&error=")).toBe(true);
    expect(new URL(url, "http://x").searchParams.get("error")).toBe('Type "REMOVE" to confirm');
  });

  it("serves thumbnails from the Trash route, not the public media routes", () => {
    expect(trashThumbUrl("tree-1", "media-1")).toBe("/api/trees/tree-1/trash/media/media-1/thumb");
  });
});
