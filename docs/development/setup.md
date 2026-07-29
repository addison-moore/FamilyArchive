# Development Setup

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- pnpm 10 (`corepack enable`)
- Docker (for Postgres and Valkey)

## First run

```bash
pnpm install
cp .env.example .env
# Set AUTH_SECRET and uncomment the localhost DATABASE_URL / REDIS_URL lines.

# Start backing services only
docker compose up -d postgres valkey

# Apply database migrations
pnpm db:migrate

# Start web (http://localhost:3000) and worker together
pnpm dev
```

## Full stack from source

The repository's root `compose.yaml` **builds the production images from your
checkout** (`docker/web.Dockerfile` and `docker/worker.Dockerfile`) and runs
the whole stack — app, worker, Postgres, Valkey, and the one-shot `migrate`
service:

```bash
cp .env.example .env   # set AUTH_SECRET (openssl rand -base64 32)
docker compose up -d           # first build is slow: the worker image
                               # installs ffmpeg, Tesseract, and MediaPipe
docker compose up -d --build   # rebuild after code changes
```

The images can also be built without starting anything:
`docker compose build`.

Two related compose variants:

- `docker/docker-compose.images.yml` — overlay that swaps the source builds
  for published GHCR images (from a checkout):
  `docker compose -f compose.yaml -f docker/docker-compose.images.yml pull`
  then `… up -d --no-build`. Images are published only on release tags, with
  no `latest` tag; set `FAMILYARCHIVE_VERSION` in `.env` to pick one.
- `docker/self-hosting/docker-compose.yml` — the standalone end-user stack
  (no checkout required); see the
  [self-hosting quickstart](../self-hosting/quickstart.md).

## Verifying a build with the smoke suite

Run against a **fresh** stack — the suite registers the first account:

```bash
# One-time: install the Playwright browser
pnpm --filter @familyarchive/smoke-tests exec playwright install chromium

docker compose down -v && docker compose up -d --build
pnpm test:smoke        # BASE_URL=http://host:port to target a non-default address
```

The suite covers registration through public mode (PRD §32.2); see
[CONTRIBUTING.md](../../CONTRIBUTING.md) for the Mailpit email sink and the
opt-in quota/S3 passes.

## Common commands

| Command            | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `pnpm dev`         | Web app + worker in watch mode                       |
| `pnpm build`       | Production build                                     |
| `pnpm typecheck`   | TypeScript across all packages                       |
| `pnpm lint`        | ESLint                                               |
| `pnpm format`      | Prettier (write)                                     |
| `pnpm test:unit`   | Vitest unit tests (`apps`/`packages` `**/*.test.ts`) |
| `pnpm test:smoke`  | Playwright smoke suite (fresh stack — see above)     |
| `pnpm db:generate` | Generate a Drizzle migration from schema             |
| `pnpm db:migrate`  | Apply migrations                                     |

## Repository layout

See `CLAUDE.md` and the PRD (`_plans/ProductRequirments.md`) for the monorepo
structure, conventions, and the milestone plan. Feature work starts with a plan
document in `_plans/`.
