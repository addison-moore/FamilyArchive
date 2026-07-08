# Contributing to FamilyArchive

Thanks for your interest! FamilyArchive is AGPL-3.0-or-later; contributions
are accepted under the same license.

## Getting started

Follow [docs/development/setup.md](docs/development/setup.md) — Node 22, pnpm
10, and Docker are all you need. `pnpm dev` runs the web app and worker
against `docker compose up -d postgres valkey`.

## Before opening a PR

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
```

For changes touching end-to-end behavior, run the smoke suite against a fresh
stack:

```bash
docker compose down -v && docker compose up -d --build
pnpm test:smoke
```

## Ground rules

- **The PRD is the source of truth** (`_plans/ProductRequirments.md`). Feature
  work starts with a plan document in `_plans/` — see `CLAUDE.md` for the
  workflow and scope discipline (v1 non-goals are off the table).
- **Migrations** are generated with `pnpm db:generate` and reviewed by hand;
  never edit an applied migration.
- **Never use real personal data** in fixtures, tests, or docs — sample
  families are fictional (PRD §1.5).
- Keep modules in their packages (GEDCOM logic in `packages/gedcom`, storage
  in `packages/media`, and so on) and match the existing code style.
- Every archive-scoped query filters by tree id and enforces the caller's
  role — no exceptions (PRD §31.2).

## Reporting issues

Use the GitHub issue tracker. For anything security-sensitive (auth bypass,
access to private archives), please report privately to the maintainer rather
than opening a public issue.
