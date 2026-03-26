# syntax=docker/dockerfile:1
# Next.js + custom WebSocket server (server.ts) + Prisma (SQLite)

FROM node:20-bookworm-slim AS builder

WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
# `next build` runs server code for API routes; PrismaClient requires a defined DATABASE_URL.
# Absolute path skips relative resolution in lib/server/prisma.ts; DB is throwaway for this stage only.
ENV DATABASE_URL=file:/tmp/prisma-build.db
RUN npx prisma db push
RUN npm run build

# ---

FROM node:20-bookworm-slim AS runner

WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOST=0.0.0.0
# Resolved under prisma/ (see lib/server/prisma.ts); mount volume on prisma/data for persistence
ENV DATABASE_URL=file:./data/app.db

COPY --from=builder /app /app

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && mkdir -p prisma/data \
  && chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

# Apply schema to SQLite, then start HTTP + WS on /api/ws
CMD ["sh", "-c", "mkdir -p prisma/data && npx prisma db push && exec npx tsx server.ts"]
