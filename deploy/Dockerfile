# One image for services/api, services/indexer and services/keeper (the compose file picks the
# command). Workspace packages ship TypeScript source, so the services run it directly (tsx, Ponder).
FROM node:22-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# Manifests first, so dependency layers are cached across source-only changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/abi/package.json packages/abi/
COPY packages/config/package.json packages/config/
COPY packages/sdk/package.json packages/sdk/
COPY services/api/package.json services/api/
COPY services/indexer/package.json services/indexer/
COPY services/keeper/package.json services/keeper/
RUN pnpm install --frozen-lockfile \
      --filter @feeflow/api... --filter @feeflow/indexer... --filter @feeflow/keeper...

COPY packages/abi packages/abi
COPY packages/config packages/config
COPY packages/sdk packages/sdk
COPY services/api services/api
# Ponder writes its build cache to services/indexer/.ponder.
COPY --chown=node:node services/indexer services/indexer
COPY services/keeper services/keeper

ENV NODE_ENV=production
USER node
