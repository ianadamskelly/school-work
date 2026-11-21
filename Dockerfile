FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --maxsockets=5 --fetch-retries=5
COPY . .
RUN npm run build:vps

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 DATABASE_PATH=/app/data/work-journal.sqlite
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node lib/sqlite-d1.mjs ./lib/sqlite-d1.mjs
COPY --chown=node:node scripts/start-vps.mjs ./scripts/start-vps.mjs
COPY --chown=node:node scripts/clear-seeded-journal.mjs ./scripts/clear-seeded-journal.mjs
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node seed-data ./seed-data
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","scripts/start-vps.mjs"]
