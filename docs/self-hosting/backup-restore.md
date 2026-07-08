# Backup and Restore

A FamilyArchive instance has exactly two things worth backing up:

1. **The Postgres database** — people, relationships, media metadata, users,
   suggestions, audit log.
2. **The media volume** — original files and generated derivatives
   (`/data/media` in the containers; the `media-data` Docker volume).

Valkey holds only transient job queues — it never needs backup. All commands
below run from the repository root against the Docker Compose deployment.

## Backup

```bash
# 1. Database dump
docker compose exec -T postgres pg_dump -U familyarchive -d familyarchive \
  --format=custom > familyarchive-$(date +%F).dump

# 2. Media files
docker compose cp app:/data/media ./media-backup-$(date +%F)
```

Copy both artifacts somewhere safe (another machine, object storage). If you
use the S3 storage driver, media already lives in your bucket — back the
bucket up according to your provider and skip step 2.

For consistency on a busy instance, stop the app and worker first
(`docker compose stop app worker`), back up, then `docker compose start app worker`.

## Restore

On a fresh checkout with your `.env` in place:

```bash
docker compose up -d postgres            # database only, healthy
docker compose exec -T postgres pg_restore -U familyarchive -d familyarchive \
  --clean --if-exists < familyarchive-YYYY-MM-DD.dump

docker compose up -d                      # start everything else
docker compose cp ./media-backup-YYYY-MM-DD/. app:/data/media   # media back in place
```

Log in with your existing account — users, archives, and media metadata come
from the database dump; the copied files line up via their stored storage keys.

## What about migrations?

Restores must run against the **same or newer** application version than the
backup. The one-shot `migrate` service applies any newer migrations on the
next `docker compose up`.
