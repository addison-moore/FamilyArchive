#!/bin/sh
# Drops root before anything touches an uploaded file: the worker feeds untrusted
# media to ffmpeg, poppler, Tesseract and libvips, and none of those should run
# with more privilege than the media they read.
#
# It starts as root only to hand over the shared media volume. Volumes first used
# by an older image hold root-owned files the worker could no longer overwrite, and
# the find leaves correctly owned files alone so a large library starts quickly.
set -e

if [ "$(id -u)" = "0" ]; then
  find /data/media ! -user app -exec chown app:app {} + 2> /dev/null || true
  exec setpriv --reuid=1001 --regid=1001 --init-groups env HOME=/home/app "$@"
fi

exec "$@"
