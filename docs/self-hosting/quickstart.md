# Quickstart — Docker Compose

Run a full FamilyArchive instance (web app, worker, Postgres, Valkey) from
published images. All you need is a machine with Docker.

## Prerequisites

- Docker with the Compose v2 plugin (Compose v2.20+) — on Windows, use Docker
  Desktop with WSL 2

## Option 1: installer script

```bash
curl -fsSLO https://github.com/addison-moore/FamilyArchive/releases/latest/download/install.sh
bash install.sh
```

The installer checks Docker, creates a `familyarchive/` directory, downloads
the compose file and configuration template for the latest release, generates
the required secrets, starts everything, and waits until the app answers at
<http://localhost:3000>.

Prefer to read it before running it? It is short — open `install.sh` in an
editor between the two commands. Options: `--dir`, `--port`, `--version`
(`bash install.sh --help`).

## Option 2: manual setup

```bash
mkdir familyarchive && cd familyarchive
curl -fsSLO https://github.com/addison-moore/FamilyArchive/releases/latest/download/docker-compose.yml
curl -fsSL -o .env https://github.com/addison-moore/FamilyArchive/releases/latest/download/example.env

# Edit .env and set AUTH_SECRET — generate one with:
openssl rand -base64 32

docker compose up -d
```

Then open <http://localhost:3000>.

Database migrations run automatically (the one-shot `migrate` service) before
the app and worker start. Images are published for amd64 and arm64, and the
compose file from a release is pinned to that release's version — nothing
floats. Each release also attaches a `checksums.txt` (SHA-256) if you want to
verify the downloads.

## First run: create the owner account

Open <http://localhost:3000/register> and create the first account — it
automatically becomes the instance **Owner**. After that, registration is
invite-only: family members join through invite links created by tree admins
(Settings → Invites). If SMTP is configured (see the
[environment reference](environment.md)), invites can be emailed directly;
otherwise copy the invite link and share it yourself.

## Checking status

```bash
docker compose ps
docker compose logs -f app worker
curl http://localhost:3000/api/health   # → {"status":"ok"}
```

## Upgrading

Each release's compose file is pinned to its version. To upgrade, set
`FAMILYARCHIVE_VERSION` in `.env` to the new release — without the leading
`v`, e.g. `0.2.0` (see the
[releases page](https://github.com/addison-moore/FamilyArchive/releases)) —
then:

```bash
docker compose pull && docker compose up -d
```

Read the release notes first — they call out anything an upgrade needs.

## Stopping

```bash
docker compose down          # keep data
docker compose down -v       # delete data (Postgres, Valkey, media volumes)
```

## Try it with sample data

Download the fictional nine-person sample family:
[`ashford-family.ged`](https://raw.githubusercontent.com/addison-moore/FamilyArchive/main/sample-data/ashford-family.ged).
After creating your owner account: **My archives → Import GEDCOM → New
archive** and pick the file. You'll get a browsable tree, a flagged duplicate
to try the merge tool on, and data to search.

## Building from source instead

Contributors — and anyone who prefers to build the Docker images from source —
should clone the repository and follow the
[development setup guide](../development/setup.md), which covers both the dev
environment and the full built-from-source stack.

## Configuration

See the [environment variables reference](environment.md). Defaults are chosen
so that only `AUTH_SECRET` is required.
