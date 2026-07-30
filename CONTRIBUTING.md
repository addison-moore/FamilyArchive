# Contributing to FamilyArchive

Thanks for your interest! FamilyArchive is AGPL-3.0-or-later; contributions
are accepted under the same license.

## Getting started

Follow [docs/development/setup.md](docs/development/setup.md) — Node 22, pnpm
10, and Docker are all you need. `pnpm dev` runs the web app and worker
against `docker compose up -d postgres valkey`.

## Before opening a PR

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:unit && pnpm build
```

CI (`.github/workflows/ci.yml`) runs lint, format check, typecheck, and unit
tests on every push and PR; `pnpm build` and the smoke suite run in CI only on
pushes to `main` and release tags, so run them locally before opening a PR.
Unit tests are Vitest files colocated with their source
(`apps/*/src/**/*.test.ts` and `packages/*/src/**/*.test.ts`); add or extend
them when you touch pure logic.

For changes touching end-to-end behavior, run the smoke suite against a fresh
stack:

```bash
# One-time: install the Playwright browser
pnpm --filter @familyarchive/smoke-tests exec playwright install chromium

docker compose down -v
docker compose -f compose.yaml -f docker/docker-compose.mailpit.yml up -d --build
pnpm test:smoke
```

This runs the core smoke spec first (it bootstraps the instance owner), then
the permission-matrix and feature specs. The Mailpit override is optional —
it captures outbound email so the password-reset spec can follow the emailed
link; without it that one spec skips itself. To rerun just the permission
checks on an already-used stack:

```bash
pnpm --filter @familyarchive/smoke-tests exec playwright test --project=permissions --no-deps
```

Two opt-in suites need specially-configured stacks and run before releases —
see [docs/development/release-checklist.md](docs/development/release-checklist.md):
the storage-quota pass (`QUOTA_SMOKE=1`) and the S3/MinIO driver pass
(`S3_SMOKE=1`).

## Ground rules

- **Discuss scope before building.** Product requirements and feature plans
  are kept by the maintainer (see `CLAUDE.md` for the workflow); open an issue
  first so a change is agreed before you invest in it.
- **Migrations** are generated with `pnpm db:generate` and reviewed by hand;
  never edit an applied migration.
- **Never use real personal data** in fixtures, tests, or docs — sample
  families are fictional.
- Keep modules in their packages (GEDCOM logic in `packages/gedcom`, storage
  in `packages/media`, and so on) and match the existing code style.
- Every archive-scoped query filters by tree id and enforces the caller's
  role — no exceptions.

## Reporting issues

Use the GitHub issue tracker. For anything security-sensitive (auth bypass,
access to private archives), please report privately to the maintainer rather
than opening a public issue.
