/**
 * Minimal typing for `archiver` v8 (pure ESM, class API) covering the surface
 * the export job uses — DefinitelyTyped only covers the legacy v7 API.
 */
declare module "archiver" {
  import type { Readable } from "node:stream";

  interface ZipEntryData {
    name: string;
    store?: boolean;
  }

  interface ZipArchiveOptions {
    zlib?: { level?: number };
    store?: boolean;
  }

  export class ZipArchive extends Readable {
    constructor(options?: ZipArchiveOptions);
    append(source: Readable | Buffer | string, data: ZipEntryData): this;
    finalize(): Promise<void>;
  }
}
