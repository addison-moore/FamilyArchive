# Changelog

## 0.1.0 (unreleased — pending UAT)

First release of FamilyArchive: a free, open-source, self-hosted family
history and media archive.

- Multi-archive instances with per-archive roles (admin/editor/contributor/
  viewer), invite links, and SMTP invite emails
- People, flexible relationships (adoption, step-parents, partners, and more),
  places, notes, soft delete
- Interactive React Flow family tree with per-user starting person and view
  modes
- GEDCOM import/export with raw-record preservation; import into an existing
  archive records provenance sources
- Shared archive graph: manual person merge with side-by-side compare;
  per-user "my branch" browsing views
- Google-Photos-style media library: streaming uploads, local or S3-compatible
  storage, exact-duplicate detection, immutable originals
- Background processing (BullMQ + Valkey): image/video/PDF thumbnails and
  previews with retries and visible statuses
- Tesseract OCR for PDFs and scanned documents, manual transcription, and
  opt-in AI cleanup (OpenAI/Anthropic, disabled by default)
- MediaPipe face detection with Facebook-style click-to-tag face boxes
- Collections, Postgres full-text search with grouped results and filters
- Structured suggestions with admin review and email notifications
- Admin audit log with configurable retention
- Public read-only mode per archive with search-engine indexing opt-in
- Docker Compose deployment (single command), documentation, smoke-test suite
