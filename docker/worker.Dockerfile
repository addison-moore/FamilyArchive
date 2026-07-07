# FamilyArchive worker (TypeScript job orchestrator).
# Also used as the one-shot migration runner in docker-compose.
FROM node:22-alpine
RUN corepack enable
# Media tooling the worker shells out to (PRD §26.3): ffmpeg for video frames,
# poppler (pdftoppm) for PDF page previews.
RUN apk add --no-cache ffmpeg poppler-utils
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker ./apps/worker
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter @familyarchive/worker... --filter @familyarchive/db...

ENV NODE_ENV=production
# Match the web app's uid so the shared media volume is writable from both.
RUN mkdir -p /data/media && chown -R 1001:1001 /data
CMD ["pnpm", "--filter", "@familyarchive/worker", "start"]
