# Storage Configuration

FamilyArchive stores original media files immutably: uploads are
hashed, written once under a generated key, and never modified. Thumbnails and
other derivatives are stored separately.

## Local filesystem (default)

```env
MEDIA_STORAGE_DRIVER=local
MEDIA_LOCAL_PATH=/data/media
```

In the Docker Compose setup this path is the `media-data` volume, mounted into
the app and worker containers and located outside the public web root. Files
are only reachable through authorized application routes.

## S3-compatible object storage

```env
MEDIA_STORAGE_DRIVER=s3
S3_ENDPOINT=https://…            # omit for AWS S3
S3_BUCKET=familyarchive
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_REGION=auto
S3_FORCE_PATH_STYLE=true         # required by MinIO and most self-hosted stores
```

Works with AWS S3, MinIO, Cloudflare R2, and other S3-compatible services.
Uploads stream through the app server to the bucket (the server computes the
content hash for deduplication); files are served back through authorized
application routes, so the bucket can stay fully private.

### Local MinIO profile (source checkout only)

The standalone self-hosting stack does not bundle MinIO — point the `S3_*`
variables at any S3-compatible service you already run. In a source checkout,
the dev stack ships an optional MinIO for local testing:

```bash
docker compose --profile minio up -d
```

Then create a bucket (e.g. via the MinIO console on `localhost:9001`, which like the
API is published on the loopback address only) and point the
`S3_*` variables at `http://minio:9000` from inside the compose network.

## Upload limits

```env
MEDIA_MAX_UPLOAD_MB=500   # per-file cap, enforced during streaming
```

Accepted upload types: JPEG, PNG, WebP, GIF, HEIC, TIFF images; MP4, WebM,
QuickTime video; MP3, M4A, WAV, OGG audio; PDF. An upload is refused if its leading
bytes don't match the type it declares, and files are stored under generated keys —
never under their original filenames.

## Deleted files and freeing space

Deleting a file only moves it to the archive's [Trash](../concepts.md): its original
and previews stay in storage, still count toward `MEDIA_QUOTA_MB`, and can be
restored. An archive admin frees the space by removing the item permanently from
Trash, which deletes the original and its previews from whichever driver stored them
and updates the usage figures. If the removal fails, the item stays in Trash and the
admin can try again. Nothing is removed automatically.

On S3-compatible storage, the credentials need to list, read, write and delete
objects in the bucket. If the bucket has versioning or object lock turned on, a delete
may only hide an object, and its storage stays in use until your provider's lifecycle
rules clear it. FamilyArchive can't see that from its side.

Permanent removal doesn't reach copies made earlier: your
[backups](backup-restore.md) and any [export bundle](export.md) still contain the file.
