# Archive export

Every archive can be exported as a single self-contained ZIP: the family tree,
all original media files, and every detail — enough to satisfy data
portability, serve as a user-managed backup, or seed a move to another server.

## Requesting an export

An archive **admin** opens **Settings → Export everything** and clicks
"Export archive". Assembly runs in the background (large archives take a
while); when SMTP is configured, the requester gets an email with a download
link. The bundle stays downloadable for **7 days**, and each archive keeps one
bundle at a time — exporting again replaces the previous one.

There is also a REST endpoint for automation:

```bash
# request (admin session required)
curl -X POST https://your-host/api/trees/<archive-id>/export
# poll status
curl https://your-host/api/trees/<archive-id>/export
# download when status is "complete"
curl -OJ https://your-host/api/trees/<archive-id>/export/download
```

## What's in the bundle

| File            | Contents                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `gedcom.ged`    | The family tree in standard GEDCOM 5.5.1 — importable into FamilyArchive and other genealogy software                                        |
| `data.json`     | Every record: people, relationships, places, media details (including extracted text and face tags), collections, tags, sources, suggestions |
| `media/`        | The original files, one folder per media item (folder name = the media id used in `data.json`)                                               |
| `manifest.json` | Schema version and entry counts                                                                                                              |
| `README.txt`    | What the bundle is and how to use it                                                                                                         |

Per-file SHA-256 checksums for `media/` are the `hash` field on each media
record in `data.json`. Deleted people and files are excluded unless the
"Also include people and files that were deleted" option is checked.

## Using the bundle

- **As a backup:** keep the ZIP somewhere safe alongside your regular
  [database + media backups](backup-restore.md) — it is a complete,
  human-readable snapshot.
- **To move to a new server:** install FamilyArchive
  ([quickstart](quickstart.md)), import `gedcom.ged` as a new archive, and
  re-upload the files in `media/`. Automatic bundle import is not available
  yet.

## Notes

- Exports never include generated thumbnails or previews — they are recreated
  automatically wherever the originals are uploaded.
- Bundles are stored next to your media (local disk or S3) but never count
  against a storage quota; expired bundles are cleaned up automatically.
