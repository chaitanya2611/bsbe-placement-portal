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
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages ./packages
RUN pnpm --filter @bsbe/api... run build
RUN pnpm --filter @bsbe/api deploy --prod --legacy /opt/api

FROM node:24.18.0-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node --from=build /opt/api ./
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/main.js"]
