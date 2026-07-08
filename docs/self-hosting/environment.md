# Environment Variables Reference

Copy `.env.example` to `.env` and adjust. The schema lives in `packages/config`
(`getEnv()`), which validates on startup and fails fast with a readable error.

## Required

| Variable      | Description                                                   |
| ------------- | ------------------------------------------------------------- |
| `AUTH_SECRET` | Session signing secret, ≥32 chars. `openssl rand -base64 32`. |

## Core (defaults shown)

| Variable            | Default                  | Description                               |
| ------------------- | ------------------------ | ----------------------------------------- |
| `APP_URL`           | `http://localhost:3000`  | Public URL of the instance                |
| `APP_PORT`          | `3000`                   | Host port mapped to the web app (compose) |
| `DATABASE_URL`      | _(set by compose)_       | Postgres connection string                |
| `REDIS_URL`         | `redis://localhost:6379` | Valkey/Redis connection string            |
| `POSTGRES_USER`     | `familyarchive`          | Compose-managed Postgres user             |
| `POSTGRES_PASSWORD` | `familyarchive`          | Change this for any non-local deployment  |
| `POSTGRES_DB`       | `familyarchive`          | Compose-managed database name             |

## Storage (see [storage.md](storage.md))

| Variable               | Default       | Description                               |
| ---------------------- | ------------- | ----------------------------------------- |
| `MEDIA_STORAGE_DRIVER` | `local`       | `local` or `s3`                           |
| `MEDIA_LOCAL_PATH`     | `/data/media` | Media path for the local driver           |
| `MEDIA_MAX_UPLOAD_MB`  | `500`         | Per-file upload cap                       |
| `S3_*`                 | —             | S3-compatible storage; see `.env.example` |

## SMTP (used from Milestone 2, optional)

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. Without SMTP,
invite links can still be created and shared manually.

## Audit log

`AUDIT_RETENTION_DAYS` (default `0` = keep forever) — the worker purges older
audit entries daily. The audit view lives under each archive's settings
(admins only).

## OCR

`OCR_LANGUAGES` (default `eng`) — Tesseract language codes, `+`-separated. See
[ocr-ai.md](ocr-ai.md).

## External AI providers (disabled by default)

`AI_PROVIDER` (`openai` | `anthropic`), `AI_API_KEY`, and optional `AI_MODEL`.
FamilyArchive never sends family data to external services unless an admin
explicitly configures these; AI cleanup only runs on explicit user action. See
[ocr-ai.md](ocr-ai.md).
