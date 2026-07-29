# Release Checklist

Run these before tagging a release. CI covers the static checks and the main
end-to-end suite on every push to `main`; the quota and S3 passes are manual
because each needs its own specially-configured stack.

## 1. Static checks and unit tests

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:unit && pnpm build
```

## 2. Full end-to-end suite (fresh stack, with the Mailpit email sink)

```bash
docker compose down -v
docker compose -f compose.yaml -f docker/docker-compose.mailpit.yml up -d --build
pnpm test:smoke
```

Expected: the `core`, `permissions`, and `features` projects all pass; the
`quota` and `s3` projects report skipped (they run below).

## 3. Storage-quota pass (fresh stack with a tiny quota)

```bash
docker compose down -v
MEDIA_QUOTA_MB=1 METRICS_TOKEN=smoke-metrics-token-1 docker compose up -d
QUOTA_SMOKE=1 pnpm --filter @familyarchive/smoke-tests exec playwright test --project=quota
```

## 4. S3 driver pass (fresh stack on MinIO)

```bash
docker compose down -v
docker compose -f compose.yaml -f docker/docker-compose.s3.yml --profile minio up -d --build
S3_SMOKE=1 pnpm --filter @familyarchive/smoke-tests exec playwright test --project=s3
```

## 5. Tag and publish

```bash
docker compose down -v   # leave nothing running on test data
```

- Update `CHANGELOG.md` (date + notes) and commit.
- `git tag vX.Y.Z && git push origin vX.Y.Z` — the `release-images.yml`
  workflow builds and publishes versioned multi-arch images to GHCR (no
  `latest` tag, by design), then creates the GitHub Release with the
  self-hosting artifacts attached: `docker-compose.yml` (version-stamped),
  `example.env`, `install.sh`, and `checksums.txt`.
- Edit the generated release notes against the changelog.

## 6. Verify the published release

- **First release only:** make the GHCR packages public —
  `familyarchive-web` and `familyarchive-worker` under the repo owner's
  Packages settings default to private on first publish, which breaks
  anonymous pulls.
- `docker manifest inspect ghcr.io/addison-moore/familyarchive-web:X.Y.Z`
  succeeds anonymously.
- On a clean machine (or an empty directory on a machine without the repo):
  run the two quickstart commands (`curl -fsSLO …/install.sh && bash
install.sh`), register the owner, and import the sample GEDCOM
  ([download](https://raw.githubusercontent.com/addison-moore/FamilyArchive/main/sample-data/ashford-family.ged)).
- Re-sync the website docs snapshot (`pnpm sync-docs` in `family-archive-site`,
  review the diff, commit) so the published guide matches the release.
