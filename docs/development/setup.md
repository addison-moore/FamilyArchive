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

## Common commands

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `pnpm dev`         | Web app + worker in watch mode           |
| `pnpm build`       | Production build                         |
| `pnpm typecheck`   | TypeScript across all packages           |
| `pnpm lint`        | ESLint                                   |
| `pnpm format`      | Prettier (write)                         |
| `pnpm db:generate` | Generate a Drizzle migration from schema |
| `pnpm db:migrate`  | Apply migrations                         |

## Repository layout

See `CLAUDE.md` and the PRD (`_plans/ProductRequirments.md`) for the monorepo
structure, conventions, and the milestone plan. Feature work starts with a plan
document in `_plans/`.
