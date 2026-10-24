# For GCP Cloud Run (or any container-based host) — Cloud Run just needs an HTTP server
# listening on $PORT, which is what src/server.ts is. Requires pnpm-lock.yaml to be
# committed (run `pnpm install` locally first).
FROM node:24-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@10

FROM base AS builder
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM base AS production
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
COPY --from=builder /app/dist ./dist

EXPOSE 8080
CMD ["node", "dist/server.js"]
