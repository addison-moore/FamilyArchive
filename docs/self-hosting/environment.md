# Environment Variables Reference

Set these in the `.env` file next to your `docker-compose.yml` — the release's
`example.env` is the template (in a source checkout, copy `.env.example`
instead). Configuration is validated on startup and fails fast with a readable
error.

## Required

| Variable      | Description                                                   |
| ------------- | ------------------------------------------------------------- |
| `AUTH_SECRET` | Session signing secret, ≥32 chars. `openssl rand -base64 32`. |

## Core (defaults shown)

| Variable            | Default                 | Description                                                                 |
| ------------------- | ----------------------- | --------------------------------------------------------------------------- |
| `APP_URL`           | `http://localhost:3000` | Public URL of the instance                                                  |
| `APP_PORT`          | `3000`                  | Host port mapped to the web app (compose)                                   |
| `DATABASE_URL`      | _(set by compose)_      | Postgres connection string                                                  |
| `REDIS_URL`         | _(set by compose)_      | Valkey/Redis connection string; `redis://localhost:6379` for bare-metal dev |
| `POSTGRES_USER`     | `familyarchive`         | Compose-managed Postgres user                                               |
| `POSTGRES_PASSWORD` | `familyarchive`         | Change this for any non-local deployment (the installer generates one)      |
| `POSTGRES_DB`       | `familyarchive`         | Compose-managed database name                                               |

## Storage (see [storage.md](storage.md))

| Variable               | Default       | Description                                                                                |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------ |
| `MEDIA_STORAGE_DRIVER` | `local`       | `local` or `s3`                                                                            |
| `MEDIA_LOCAL_PATH`     | `/data/media` | Media path for the local driver (fixed inside the compose deployment; a bare-metal knob)   |
| `MEDIA_MAX_UPLOAD_MB`  | `500`         | Per-file upload cap                                                                        |
| `MEDIA_QUOTA_MB`       | `0`           | Total media storage cap (originals + previews); `0` = unlimited                            |
| `METRICS_TOKEN`        | —             | Enables `GET /api/admin/usage` (bearer auth) for external tooling                          |
| `TRUST_PROXY_HEADERS`  | `false`       | Read `X-Forwarded-For` / `X-Real-IP` when rate limiting; only enable behind your own proxy |
| `S3_*`                 | —             | S3-compatible storage; see [storage.md](storage.md) and the `.env` template                |

## Rate limiting

Sign-in, password reset and registration are throttled per email address and per
source address, with counters held in Valkey for a few minutes. There is nothing
to configure — the limits are fixed — but two things are worth knowing.

`TRUST_PROXY_HEADERS` is off by default, which means every request appears to
come from the same address and only the looser per-address bound is affected;
the per-email limit, which is the real protection, works either way. Turn it on
only when a reverse proxy you control sets the header, because anything that can
reach the app directly can forge it.

Counters are keyed `ratelimit:*` in Valkey. To clear a lockout early:

```bash
docker compose exec valkey valkey-cli --scan --pattern 'ratelimit:*' | xargs -r docker compose exec -T valkey valkey-cli del
```

If Valkey is unavailable the limiter allows the attempt rather than blocking
sign-in on a degraded instance.

## SMTP (optional)

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
