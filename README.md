# FamilyArchive

A free, open-source, self-hosted family history and media archive.
Website & docs: [family-archive.net](https://family-archive.net)

Maintain interactive family trees, upload and organize photos, videos, audio, and
scanned documents, tag people in media, OCR old letters and records, and search
across your family's history — all on your own server.

> **Status:** feature-complete for v1 (0.1.0), undergoing user acceptance
> testing before the first public release. See `CHANGELOG.md` for what's
> included and `_plans/` for the milestone history.

## Quickstart

```bash
cp .env.example .env   # set AUTH_SECRET (openssl rand -base64 32)
docker compose up -d
```

Full guide: [docs/self-hosting/quickstart.md](docs/self-hosting/quickstart.md)

## Documentation

- [Self-hosting quickstart](docs/self-hosting/quickstart.md) · [Environment reference](docs/self-hosting/environment.md)
- [Storage](docs/self-hosting/storage.md) · [Backup & restore](docs/self-hosting/backup-restore.md)
- [GEDCOM import/export](docs/self-hosting/gedcom.md) · [OCR & AI](docs/self-hosting/ocr-ai.md)
- [Concepts: archives, sources, branches](docs/concepts.md)

## Development

See [docs/development/setup.md](docs/development/setup.md) and
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

[AGPL-3.0-or-later](LICENSE)
