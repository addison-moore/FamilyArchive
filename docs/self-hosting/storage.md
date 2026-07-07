# Storage Configuration

FamilyArchive stores original media files immutably (PRD §5.6): uploads are
hashed, written once under a generated key, and never modified. Thumbnails and
other derivatives (from Milestone 7 on) are stored separately.

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

### Local MinIO profile

For an S3-compatible store on the same host:

```bash
docker compose --profile minio up -d
```

Then create a bucket (e.g. via the MinIO console on port 9001) and point the
`S3_*` variables at `http://minio:9000` from inside the compose network.

## Upload limits

```env
MEDIA_MAX_UPLOAD_MB=500   # per-file cap, enforced during streaming
```

Accepted upload types: JPEG, PNG, WebP, GIF, HEIC, TIFF images; MP4, WebM,
QuickTime video; MP3, M4A, WAV, OGG audio; PDF. Files are validated by MIME
type and stored under generated keys — never under their original filenames.
