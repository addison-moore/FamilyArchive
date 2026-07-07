import type { Readable } from "node:stream";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

import type { ByteRange, StorageDriver, StorageObjectStream } from "./storage";

export interface S3DriverOptions {
  endpoint?: string;
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

/** S3-compatible driver (PRD §24.3) — AWS S3, MinIO, R2, etc. */
export class S3StorageDriver implements StorageDriver {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3DriverOptions) {
    this.bucket = options.bucket;
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region ?? "auto",
      forcePathStyle: options.forcePathStyle ?? true,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async putStream(key: string, data: Readable): Promise<void> {
    // lib-storage handles unknown-length streams via multipart upload.
    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: key, Body: data },
    });
    await upload.done();
  }

  async getStream(key: string, range?: ByteRange): Promise<StorageObjectStream> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: range ? `bytes=${range.start}-${range.end ?? ""}` : undefined,
      }),
    );
    if (!response.Body) throw new Error(`Empty storage object: ${key}`);
    const stream = response.Body as Readable;
    if (range && response.ContentRange) {
      // "bytes start-end/total"
      const match = response.ContentRange.match(/bytes (\d+)-(\d+)\/(\d+)/);
      if (match) {
        return {
          stream,
          totalSize: Number(match[3]),
          range: { start: Number(match[1]), end: Number(match[2]) },
        };
      }
    }
    return { stream, totalSize: response.ContentLength ?? 0 };
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${encodeURIComponent(fromKey).replace(/%2F/g, "/")}`,
        Key: toKey,
      }),
    );
    await this.delete(fromKey);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
