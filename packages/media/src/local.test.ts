import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalStorageDriver } from "./local";
import type { StorageObjectStream } from "./storage";

let root: string;
let driver: LocalStorageDriver;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "familyarchive-local-test-"));
  driver = new LocalStorageDriver(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function readAll(object: StorageObjectStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of object.stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function put(key: string, content: string, overwrite?: boolean): Promise<void> {
  return driver.putStream(key, Readable.from(Buffer.from(content)), { overwrite });
}

describe("LocalStorageDriver", () => {
  it("round-trips content through nested keys", async () => {
    await put("trees/t1/media/m1/original/hash.png", "hello archive");
    const object = await driver.getStream("trees/t1/media/m1/original/hash.png");
    expect(object.totalSize).toBe(13);
    expect(object.range).toBeUndefined();
    expect(await readAll(object)).toBe("hello archive");
  });

  it("serves byte ranges and clamps ends past the file size", async () => {
    await put("clip", "0123456789");

    const middle = await driver.getStream("clip", { start: 2, end: 5 });
    expect(await readAll(middle)).toBe("2345");
    expect(middle.range).toEqual({ start: 2, end: 5 });
    expect(middle.totalSize).toBe(10);

    const openEnded = await driver.getStream("clip", { start: 4 });
    expect(await readAll(openEnded)).toBe("456789");
    expect(openEnded.range).toEqual({ start: 4, end: 9 });

    const overshoot = await driver.getStream("clip", { start: 0, end: 99 });
    expect(await readAll(overshoot)).toBe("0123456789");
    expect(overshoot.range).toEqual({ start: 0, end: 9 });
  });

  it("refuses to clobber existing files unless overwrite is set", async () => {
    await put("original", "first");
    await expect(put("original", "second")).rejects.toThrow(/EEXIST/);
    expect(await readAll(await driver.getStream("original"))).toBe("first");

    await put("original", "replaced", true);
    expect(await readAll(await driver.getStream("original"))).toBe("replaced");
  });

  it("rejects keys that escape the media root", async () => {
    const escape = /escapes the media root/;
    await expect(driver.getStream("../outside")).rejects.toThrow(escape);
    await expect(put("a/../../outside", "x")).rejects.toThrow(escape);
    await expect(driver.delete("/etc/passwd")).rejects.toThrow(escape);
    await expect(driver.move("ok", "../outside")).rejects.toThrow(escape);
  });

  it("allows dot segments that stay inside the root", async () => {
    await put("a/../b", "inside");
    expect(await readAll(await driver.getStream("b"))).toBe("inside");
  });

  it("moves objects and deletes without error on missing keys", async () => {
    await put("tmp-upload", "payload");
    await driver.move("tmp-upload", "final/spot");
    expect(await readAll(await driver.getStream("final/spot"))).toBe("payload");
    await expect(driver.getStream("tmp-upload")).rejects.toThrow(/ENOENT/);

    await driver.delete("final/spot");
    await expect(driver.getStream("final/spot")).rejects.toThrow(/ENOENT/);
    await expect(driver.delete("never-existed")).resolves.toBeUndefined();
  });
});
