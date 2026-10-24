FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable pnpm
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/data/scryboard.db ASSETS_DIR=/data/assets WEB_DIST_DIR=/app/apps/web/dist
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --prod --filter @scryboard/server...
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/drizzle apps/server/drizzle
COPY --from=build /app/apps/web/dist apps/web/dist
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
WORKDIR /app/apps/server
CMD ["node", "dist/index.js"]
