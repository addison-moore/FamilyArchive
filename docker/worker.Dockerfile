# FamilyArchive worker (TypeScript job orchestrator).
# Also used as the one-shot migration runner in docker-compose.
FROM node:22-alpine
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker ./apps/worker
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter @familyarchive/worker... --filter @familyarchive/db...

ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@familyarchive/worker", "start"]
