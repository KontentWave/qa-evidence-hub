FROM node:24.22.3-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0 AS deps

WORKDIR /workspace
RUN corepack enable pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json

RUN pnpm install --frozen-lockfile && chown -R node:node /workspace

FROM deps AS builder

COPY apps/api ./apps/api
RUN pnpm --filter @qa-evidence-hub/api build && CI=true pnpm prune --prod --ignore-scripts

FROM node:24.22.3-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0 AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV API_PORT=3001

RUN DEBIAN_FRONTEND=noninteractive apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* \
    /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/corepack \
    /opt/yarn*

COPY --from=builder --chown=node:node /workspace/node_modules ./node_modules
COPY --from=builder --chown=node:node /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=node:node /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=node:node /workspace/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=node:node /workspace/apps/api/prisma ./apps/api/prisma
COPY --chown=node:node scripts/provision-owner.ts ./scripts/provision-owner.ts

USER node
WORKDIR /app/apps/api
EXPOSE 3001

CMD ["node", "dist/main.js"]
