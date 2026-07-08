# Quickstart — Docker Compose

Run a full FamilyArchive instance (web app, worker, Postgres, Valkey) with one
command.

## Prerequisites

- Docker with the Compose plugin (Compose v2.20+)

## Steps

```bash
git clone https://github.com/familyarchive/familyarchive.git
cd familyarchive

# 1. Configure
cp .env.example .env
# Set AUTH_SECRET in .env — generate one with:
openssl rand -base64 32

# 2. Start everything
docker compose up -d
```

Then open <http://localhost:3000>.

Database migrations run automatically (the one-shot `migrate` service) before the
app and worker start.

## First run: create the owner account

Open <http://localhost:3000/register> and create the first account — it
automatically becomes the instance **Owner**. After that, registration is
invite-only: family members join through invite links created by tree admins
(Settings → Invites). If SMTP is configured (see `.env.example`), invites can be
emailed directly; otherwise copy the invite link and share it yourself.

## Checking status

```bash
docker compose ps
docker compose logs -f app worker
curl http://localhost:3000/api/health   # → {"status":"ok"}
```

## Stopping

```bash
docker compose down          # keep data
docker compose down -v       # delete data (Postgres, Valkey, media volumes)
```

## Try it with sample data

`sample-data/ashford-family.ged` is a fictional nine-person family. After
creating your owner account: **My archives → Import GEDCOM → New archive** and
pick the file. You'll get a browsable tree, a flagged duplicate to try the
merge tool on, and data to search.

## Verifying an install (smoke tests)

Against a **fresh** instance (the suite registers the first account):

```bash
corepack enable && pnpm install
pnpm --filter @familyarchive/smoke-tests exec playwright install chromium
pnpm test:smoke        # BASE_URL=http://host:port to target a non-default address
```

Thirteen checks cover registration through public mode (PRD §32.2).

## Configuration

See the [environment variables reference](environment.md). Defaults are chosen so
that only `AUTH_SECRET` is required.
