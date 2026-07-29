# FamilyArchive

A free, open-source, self-hosted family history and media archive.
Website & docs: [family-archive.net](https://family-archive.net)

Maintain interactive family trees, upload and organize photos, videos, audio, and
scanned documents, tag people in media, OCR old letters and records, and search
across your family's history all on your own server.

> **Status:** feature-complete for v1 (0.1.0), undergoing user acceptance
> testing before the first public release. See `CHANGELOG.md` for what's
> included and `_plans/` for the milestone history.

## Quickstart

Run the published images — no checkout needed (requires Docker with Compose v2):

```bash
curl -fsSLO https://github.com/addison-moore/FamilyArchive/releases/latest/download/install.sh
bash install.sh
```

Full guide (including manual setup without the script):
[docs/self-hosting/quickstart.md](docs/self-hosting/quickstart.md)

In a checkout, `docker compose up -d` **builds the images from source** and
runs the same stack — see [docs/development/setup.md](docs/development/setup.md).

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
