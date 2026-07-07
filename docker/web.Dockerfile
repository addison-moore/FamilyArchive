# FamilyArchive web app (Next.js, standalone output)
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile

# Build-time placeholders: modules validate env lazily, but Next.js evaluates route
# modules during build. No connection is opened; real values come from the runtime
# environment.
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgres://build:build@localhost:5432/build \
    AUTH_SECRET=build-time-placeholder-secret-not-used-at-runtime
RUN pnpm --filter @familyarchive/web build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
# Fixed uid/gid so the shared media volume (created with this ownership) stays
# writable regardless of which service initializes it.
RUN addgroup -S -g 1001 app && adduser -S -u 1001 app -G app \
    && mkdir -p /data/media && chown -R app:app /data
COPY --from=builder --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static
USER app
EXPOSE 3000
ENV HOSTNAME=0.0.0.0 PORT=3000
CMD ["node", "apps/web/server.js"]
