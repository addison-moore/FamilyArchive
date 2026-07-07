# FamilyArchive worker (TypeScript job orchestrator).
# Also used as the one-shot migration runner in docker-compose.
#
# Debian-based (not Alpine): MediaPipe ships no musl wheels (PRD §17.4 mandates
# MediaPipe for face detection).
FROM node:22-bookworm-slim
RUN corepack enable

# Media tooling the worker shells out to (PRD §26.3): ffmpeg for video frames,
# poppler (pdftoppm) for PDF page previews, Tesseract for OCR (PRD §18.3),
# Liberation fonts so PDFs using base-14 fonts render, Python for MediaPipe.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg poppler-utils tesseract-ocr tesseract-ocr-eng fonts-liberation \
    python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# MediaPipe Face Detector (PRD §17.4) in a venv, plus the BlazeFace model.
# 0.10.18 is the newest release with wheels for both x86_64 and aarch64 Linux.
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir mediapipe==0.10.18
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
# Match the web app's uid so the shared media volume is writable from both.
RUN mkdir -p /data/media && chown -R 1001:1001 /data
CMD ["pnpm", "--filter", "@familyarchive/worker", "start"]
