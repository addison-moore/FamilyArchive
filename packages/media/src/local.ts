import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  UnsatisfiableRangeError,
  type ByteRange,
  type PutOptions,
  type StorageDriver,
  type StorageObjectStream,
} from "./storage";

/**
 * Local filesystem driver. Files live under a root directory that
 * sits outside the public web root; all access goes through authorized
 * routes. Keys are generated internally, but paths are still confined to the
 * root as defense in depth.
 */
export class LocalStorageDriver implements StorageDriver {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const filePath = path.resolve(this.root, key);
    if (!filePath.startsWith(path.resolve(this.root) + path.sep)) {
      throw new Error(`Storage key escapes the media root: ${key}`);
    }
    return filePath;
  }

  async putStream(key: string, data: Readable, options?: PutOptions): Promise<void> {
    const filePath = this.resolve(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    // "wx" refuses to clobber — originals are written exactly once.
    await pipeline(data, createWriteStream(filePath, { flags: options?.overwrite ? "w" : "wx" }));
  }

  async getStream(key: string, range?: ByteRange): Promise<StorageObjectStream> {
    const filePath = this.resolve(key);
    const info = await stat(filePath);
    if (!range) {
      return { stream: createReadStream(filePath), totalSize: info.size };
    }
    // Only `end` used to be clamped, so a start past EOF produced start > end and
    // made createReadStream throw a RangeError — a 500 on an ordinary seek.
    if (range.start >= info.size) {
      throw new UnsatisfiableRangeError(range.start, info.size);
    }
    const end = Math.min(range.end ?? info.size - 1, info.size - 1);
    return {
      stream: createReadStream(filePath, { start: range.start, end }),
      totalSize: info.size,
      range: { start: range.start, end },
    };
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const to = this.resolve(toKey);
    await mkdir(path.dirname(to), { recursive: true });
    await rename(this.resolve(fromKey), to);
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    // resolve() applies the same root confinement as every other operation, so a
    // crafted prefix cannot turn this into a recursive delete outside the root.
    await rm(this.resolve(prefix), { recursive: true, force: true });
  }
}
