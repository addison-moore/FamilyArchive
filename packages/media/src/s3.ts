import type { Readable } from "node:stream";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
  UploadPartCopyCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

import { parseContentRange } from "./content-range";
import {
  UnsatisfiableRangeError,
  type ByteRange,
  type StorageDriver,
  type StorageObjectStream,
} from "./storage";

/** S3's hard limit for a single-request CopyObject. */
const MAX_SINGLE_PART_COPY_BYTES = 5 * 1024 * 1024 * 1024;
/** Part size for multipart copies — 512 MiB keeps part count well under 10,000. */
const COPY_PART_BYTES = 512 * 1024 * 1024;

export interface S3DriverOptions {
  endpoint?: string;
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

/** S3-compatible driver — AWS S3, MinIO, R2, etc. */
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
    let response;
    try {
      response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: range ? `bytes=${range.start}-${range.end ?? ""}` : undefined,
        }),
      );
    } catch (error) {
      // Match the local driver: an unsatisfiable range is a client error, so
      // callers get one error type to map to a 416 regardless of driver.
      if (range && error instanceof Error && error.name === "InvalidRange") {
        const head = await this.client.send(
          new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
        );
        throw new UnsatisfiableRangeError(range.start, head.ContentLength ?? 0);
      }
      throw error;
    }
    if (!response.Body) throw new Error(`Empty storage object: ${key}`);
    const stream = response.Body as Readable;
    if (range && response.ContentRange) {
      const parsed = parseContentRange(response.ContentRange);
      if (parsed) {
        return {
          stream,
          totalSize: parsed.total,
          range: { start: parsed.start, end: parsed.end },
        };
      }
    }
    return { stream, totalSize: response.ContentLength ?? 0 };
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const source = `${this.bucket}/${encodeURIComponent(fromKey).replace(/%2F/g, "/")}`;
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: fromKey }),
    );
    const size = head.ContentLength ?? 0;

    if (size > MAX_SINGLE_PART_COPY_BYTES) {
      // CopyObject is capped at 5 GiB; above that S3 requires a multipart copy.
      // Reachable whenever an operator raises MEDIA_MAX_UPLOAD_MB past ~5120.
      await this.multipartCopy(source, toKey, size);
    } else {
      await this.client.send(
        new CopyObjectCommand({ Bucket: this.bucket, CopySource: source, Key: toKey }),
      );
    }
    await this.delete(fromKey);
  }

  private async multipartCopy(source: string, toKey: string, size: number): Promise<void> {
    const created = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: toKey }),
    );
    const uploadId = created.UploadId;
    if (!uploadId) throw new Error(`S3 did not return an upload id for ${toKey}`);

    try {
      const parts: { ETag: string; PartNumber: number }[] = [];
      for (let start = 0, partNumber = 1; start < size; start += COPY_PART_BYTES, partNumber++) {
        const end = Math.min(start + COPY_PART_BYTES, size) - 1;
        const part = await this.client.send(
          new UploadPartCopyCommand({
            Bucket: this.bucket,
            Key: toKey,
            CopySource: source,
            CopySourceRange: `bytes=${start}-${end}`,
            PartNumber: partNumber,
            UploadId: uploadId,
          }),
        );
        const etag = part.CopyPartResult?.ETag;
        if (!etag) throw new Error(`S3 did not return an ETag for part ${partNumber} of ${toKey}`);
        parts.push({ ETag: etag, PartNumber: partNumber });
      }
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: toKey,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts },
        }),
      );
    } catch (error) {
      // Abandoned multipart uploads are billed until aborted.
      await this.client
        .send(
          new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: toKey, UploadId: uploadId }),
        )
        .catch(() => {});
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deletePrefix(prefix: string): Promise<void> {
    if (!prefix) throw new Error("Refusing to delete an empty storage prefix");
    let continuationToken: string | undefined;
    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const keys = (listed.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
      if (keys.length > 0) {
        // DeleteObjects caps at 1000 keys, which is also ListObjectsV2's page size.
        await this.client.send(
          new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys } }),
        );
      }
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);
  }
}
