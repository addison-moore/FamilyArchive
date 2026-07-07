# CLAUDE.md — FamilyArchive

FamilyArchive is a free, open-source (AGPL-3.0-or-later), self-hosted family history
and media archive application. Families use it to maintain interactive family trees,
upload and organize photos/videos/audio/documents, tag people in media, OCR scanned
documents, and search across their family history.

**The product requirements document is the source of truth:** `_plans/ProductRequirments.md`
(note the filename spelling). Read it before planning any feature. When this file and
the PRD conflict, the PRD wins — flag the conflict rather than guessing.

## Project Status

Greenfield. No code exists yet. Work begins at Milestone 1 (see "Milestones" below).

## Planning Workflow (required)

Every feature or milestone starts with a plan document. Do not begin implementation
without one.

1. Before implementing a feature/milestone, create `_plans/<feature-name>/PLAN.md`
   (kebab-case folder names, e.g. `_plans/milestone-1-foundation/PLAN.md`).
2. The plan must contain:
   - A short summary of the goal and relevant PRD sections (cite section numbers)
   - Scope: what is included and explicitly what is NOT (check PRD §3 Non-Goals)
   - A checklist of implementation steps using `- [ ]` markdown checkboxes
   - Open questions, if any, listed at the top for review before starting
3. Wait for the plan to be reviewed/approved before implementing.
4. As work proceeds, check off items (`- [x]`) in the PLAN.md as they are completed.
   Update the checklist in the same commit as the work when practical.
5. If scope changes mid-implementation, update the PLAN.md first, then continue.
6. When the plan is complete, add a short "Outcome" section at the bottom: what was
   built, what was deferred (and where it was deferred to), and any follow-ups.

## Scope Discipline

The v1 scope is intentionally limited. **Never implement v2/out-of-scope features**,
even if they seem like natural extensions. Out of scope for v1 (PRD §3), including:

- Timeline view, map view, comments, activity feeds
- Sharing people/data across _archives_ (merge within an archive IS in scope, PRD §10.5)
- Living-person privacy rules, configurable media visibility
- Full archive export, native JSON backup/import
- DNA features, advanced genealogy reports/citations
- Setup wizard, hosted demo
- Face recognition/person suggestions (detection only in v1)

If a task seems to require one of these, stop and raise it instead of building it.

## Tech Stack (PRD §27)

- **Language:** TypeScript everywhere
- **Web app:** Next.js (App Router) + React
- **Tree UI:** React Flow
- **Database:** Postgres via Drizzle ORM
- **Auth:** Auth.js / NextAuth, email + password only in v1
- **Jobs:** BullMQ backed by Valkey
- **Media processing:** ffmpeg (video), Tesseract (OCR), MediaPipe Face Detector
- **Storage:** local filesystem by default; optional S3-compatible driver
- **Deployment:** Docker Compose

Do not introduce other frameworks, ORMs, or infrastructure without an approved plan.

## Monorepo Structure (PRD §27.2)

```
familyarchive/
  apps/
    web/        # Next.js app
    worker/     # TypeScript job orchestrator (BullMQ consumers; calls ffmpeg, Tesseract, MediaPipe)
  packages/
    db/         # Drizzle schema, migrations, db client
    shared/     # shared types/utils
    media/      # storage drivers, media helpers
    gedcom/     # minimal GEDCOM parser/exporter
    auth/       # Auth.js config/helpers
    config/     # env/config parsing
  docker/       # Dockerfiles, compose files
  docs/         # user + self-hosting documentation
  _plans/       # PRD and feature plan documents (not shipped)
```

## Architecture Conventions

- **API style (PRD §27.3):** Server Actions for forms/simple mutations; REST endpoints
  for uploads, processing callbacks, and worker-related flows. Keep boundaries clean
  enough to support future non-web clients.
- **Migrations (PRD §27.4):** Drizzle-generated migrations, manually reviewed before
  commit. Never hand-edit applied migrations.
- **Data model (PRD §27.5):** structured relational columns for core data + a
  `metadata` JSON column for forward compatibility (preserved GEDCOM fields, media
  metadata, OCR/AI provider details, processing diagnostics).
- **Soft deletes:** people and media use soft-delete fields, not hard deletes.
- **Original media is immutable (PRD §5.6):** never modify uploaded originals.
  Thumbnails, previews, OCR text, and face boxes are derivatives stored separately.
- **Multi-tenancy (PRD §10):** the container is an **archive** (the `trees`
  table; an isolated shared graph — UI copy says "archive", routes/columns keep
  the tree naming). Every query touching people, relationships, media,
  collections, or suggestions must filter by tree ID (= archive scope) and
  enforce the caller's per-tree role (PRD §8, §31.2). Archives are fully
  isolated; _within_ an archive there is one canonical graph, GEDCOM imports are
  provenance "sources", duplicate people are resolved by manual merge, and
  per-user "branch views" filter browsing (convenience, never a privacy boundary).
- **Roles:** global Owner; per-tree Admin / Editor / Contributor / Viewer. Check the
  permission tables in PRD §8 before adding any mutation.

## Security Requirements (PRD §31)

- Trees are private by default; public mode is an explicit admin toggle.
- External AI providers are **disabled by default** and must be explicitly configured
  by an admin. Never call external AI APIs implicitly.
- Uploads: validate MIME types, enforce size limits, sanitize filenames, use generated
  storage keys, store originals outside the public web root, serve via authorized
  routes or signed URLs, never execute uploaded files.
- Destructive/modifying admin-relevant actions should write audit log entries.

## Development Commands

Requires Node 22 (`.nvmrc`) and pnpm 10 (`corepack enable`).

- Install: `pnpm install`
- Dev (web + worker): `pnpm dev` — needs `docker compose up -d postgres valkey`
  and a `.env` (copy `.env.example`, set `AUTH_SECRET`, uncomment localhost URLs)
- Build: `pnpm build`
- Lint: `pnpm lint` · Format: `pnpm format` (check: `pnpm format:check`)
- Typecheck: `pnpm typecheck`
- Tests: none yet (smoke tests land in Milestone 12)
- DB: `pnpm db:generate` (create migration from schema), `pnpm db:migrate` (apply)
- Full stack: `docker compose up -d` (root `compose.yaml` includes
  `docker/docker-compose.yml`; one-shot `migrate` service runs before app/worker)

## Testing Expectations (PRD §32)

V1 requires minimal smoke tests only — don't build large test suites yet. Smoke
coverage targets: register/login, tree creation, GEDCOM import, person/relationship
CRUD, tree renders, media upload, thumbnail job, OCR job on a sample PDF, face
detection on a sample image, search, invite links, public read-only mode.

## Coding Conventions

- TypeScript strict mode; avoid `any`.
- Prefer small, focused modules within the appropriate package — e.g. GEDCOM logic
  lives in `packages/gedcom`, not in the web app.
- Sample/demo data must be fictional (PRD §1.5). Never use real personal data in
  fixtures, tests, or docs.
- Every source file ships under AGPL-3.0-or-later; keep LICENSE and package metadata
  consistent.
- User-facing docs live in `docs/`; keep the self-hosting quickstart runnable.

## Milestones (PRD §33)

Work proceeds milestone by milestone. One plan document per milestone in `_plans/`.

1. Project Foundation — monorepo, Next.js, worker, Docker Compose, Postgres, Drizzle, Auth.js, UI shell, license, docs skeleton
2. Users, Trees, Roles — registration/login, owner role, tree CRUD, memberships, invites, SMTP invite emails
3. People and Relationships — people CRUD, profiles, sidebar, flexible relationship model, places, notes, soft delete
4. Interactive Tree — React Flow canvas, ancestors+descendants view, starting person, node actions, layout engine
5. GEDCOM — minimal parser, import-creates-new-tree, export, raw metadata preservation, duplicate warning
6. Media Library — uploads, local + S3 storage drivers, grid, detail page, tags, dedup, soft delete
7. Processing Pipeline — BullMQ + Valkey, processing states, image/video/PDF thumbnails, retries, status UI
8. OCR and Transcription — Tesseract OCR, storage + indexing, manual transcription, optional AI provider interface
9. Face Detection and Tagging — MediaPipe worker, face boxes, manual person assignment
10. Shared Archive Graph — sources/provenance, import-into-archive, person merge, branch views (PRD §10, amended 2026-07-07)
11. Collections and Search — collections CRUD, Postgres full-text search, filters, grouped results
12. Suggestions, Audit, Public Mode — structured suggestions, review flow, audit log, public trees
13. Polish and Release — responsive browsing, docs, smoke tests, sample data, GitHub release

Don't pull work forward from a later milestone unless the current plan explicitly
calls for it.
