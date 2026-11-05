# FamilyArchive worker (TypeScript job orchestrator).
# Also used as the one-shot migration runner in docker-compose.
#
# Debian-based (not Alpine): MediaPipe, used for face detection, ships no
# musl wheels.
FROM node:22-bookworm-slim
# Outside root's home, so the unprivileged user can run the pnpm it pins.
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable

# Media tooling the worker shells out to: ffmpeg for video frames,
# poppler (pdftoppm) for PDF page previews, Tesseract for OCR, libheif's converter
# for HEIC photos (sharp's prebuilt libvips reads AVIF but not HEVC),
# Liberation fonts so PDFs using base-14 fonts render, Python for MediaPipe plus the
# EGL/GLES libraries its native library links against (detection itself runs on CPU).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg poppler-utils tesseract-ocr tesseract-ocr-eng libheif-examples fonts-liberation \
    python3 python3-venv libegl1 libgles2 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# MediaPipe Face Detector in a venv, plus the BlazeFace model.
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir mediapipe==1.2.2
ENV PATH="/opt/venv/bin:$PATH"
ADD https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite /opt/models/blaze_face_short_range.tflite
RUN chmod 644 /opt/models/blaze_face_short_range.tflite
ENV FACE_MODEL_PATH=/opt/models/blaze_face_short_range.tflite

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker ./apps/worker
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter @familyarchive/worker... --filter @familyarchive/db...

ENV NODE_ENV=production
# Match the web app's uid so the shared media volume is writable from both. The
# entrypoint drops to this user; see the note there.
RUN groupadd -g 1001 app && useradd -u 1001 -g app -m app \
    && mkdir -p /data/media && chown -R app:app /data /opt/corepack
COPY docker/worker-entrypoint.sh /usr/local/bin/worker-entrypoint.sh
RUN chmod 755 /usr/local/bin/worker-entrypoint.sh
ENTRYPOINT ["worker-entrypoint.sh"]
CMD ["pnpm", "--filter", "@familyarchive/worker", "start"]
