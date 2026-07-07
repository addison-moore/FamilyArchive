# FamilyArchive

A free, open-source, self-hosted family history and media archive.

Maintain interactive family trees, upload and organize photos, videos, audio, and
scanned documents, tag people in media, OCR old letters and records, and search
across your family's history — all on your own server.

> **Status:** early development (Milestone 1 of 12 — project foundation). Not yet
> ready for real use. See `_plans/` for the roadmap.

## Quickstart

```bash
cp .env.example .env   # set AUTH_SECRET (openssl rand -base64 32)
docker compose up -d
```

Full guide: [docs/self-hosting/quickstart.md](docs/self-hosting/quickstart.md)

## Development

See [docs/development/setup.md](docs/development/setup.md).

## License

[AGPL-3.0-or-later](LICENSE)
