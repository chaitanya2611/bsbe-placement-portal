FROM node:24.18.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global pnpm@11.9.0
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
ARG VITE_APP_NAME="BSBE Placement Mock Test Portal"
ARG VITE_API_BASE_URL="/api/v1"
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages ./packages
RUN pnpm --filter @bsbe/web... run build

FROM node:24.18.0-bookworm-slim AS production
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY --chown=node:node --from=build /workspace/apps/web/dist ./dist
COPY --chown=node:node apps/web/server.mjs ./server.mjs
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
