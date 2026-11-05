import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { EXEC_LIMITS } from "./exec-limits";

const execFileAsync = promisify(execFile);

const HEIF_MIMES = new Set(["image/heic", "image/heif"]);

/**
 * A path the image tools can read. sharp's prebuilt libvips decodes AVIF but not
 * HEVC-coded HEIC, and Tesseract reads neither, so every photo a phone saved as
 * HEIC failed processing with "bad seek". libheif converts it first; the original
 * stays untouched in storage.
 */
export async function readableImagePath(
  sourcePath: string,
  mimeType: string,
  workDir: string,
): Promise<string> {
  if (!HEIF_MIMES.has(mimeType)) return sourcePath;
  await execFileAsync(
    "heif-convert",
    ["-q", "92", sourcePath, path.join(workDir, "converted.jpg")],
    EXEC_LIMITS,
  );
  // A file holding several images (a burst, say) comes out numbered, primary first.
  const files = (await readdir(workDir)).filter((name) => /^converted(-\d+)?\.jpg$/.test(name));
  const primary = files.sort()[0];
  if (!primary) throw new Error("heif-convert produced no image");
  return path.join(workDir, primary);
}
