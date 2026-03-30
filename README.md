# Realtime project board

Next.js app with a **custom Node server** (`server.ts`) that serves the app and a **WebSocket** endpoint at `/api/ws`, plus **Prisma** and **SQLite** for projects, tasks, comments, and dependencies.

## Prerequisites

- **Node.js** 20+ and npm  
- **Docker Desktop** (optional) — only if you use Docker below  
- **Redis** (optional) — only if you set `REDIS_URL` for scaled-out realtime / hot cache (see [Redis (optional)](#redis-optional))

## Run locally

### 1. Clone and install

```bash
git clone <repository-url>
cd next-app
npm install
```

### 2. Environment

Copy the example env file and adjust if needed:

```bash
cp .env.example .env
```

`DATABASE_URL` should point at a SQLite file **relative to the `prisma/` directory** (see `lib/server/prisma.ts`). The default in `.env.example` is `file:./dev.db` (database file: `prisma/dev.db`).

**Optional — `REDIS_URL`:** Leave unset for normal local development (realtime uses in-process WebSockets only). Set `REDIS_URL` when you want Redis-backed pub/sub across multiple app instances and a hot cache for `GET /api/tasks`. See [Redis (optional)](#redis-optional).

### 3. Database

Generate the Prisma client and apply the schema:

```bash
npx prisma generate
npx prisma db push
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dev server uses the same custom entry as production (`tsx server.ts`), so HTTP and WebSockets share one process.

### Production build (local)

```bash
npm run build
npm run start
```

Uses `NODE_ENV=production` and `tsx server.ts`. Set `DATABASE_URL` in `.env` (or the environment) before `npm run start`.

---

## Run with Docker

Install and start **[Docker Desktop](https://docs.docker.com/desktop/)** (or another engine with **Docker Compose v2**).

From the project root:

```bash
docker compose up --build
```

Then open [http://localhost:3000](http://localhost:3000).

| Topic | Details |
|--------|---------|
| **WebSockets** | Served from the same container as the app (`server.ts`), path `/api/ws`. |
| **Database** | SQLite file in the **`sqlite_data`** volume, under `prisma/data/` inside the container. |
| **Schema** | On container start, `prisma db push` runs so the DB is created/updated automatically. |
| **Reset data** | `docker compose down -v` removes volumes; then `docker compose up --build` again. |

Rebuild without cache if you change the Dockerfile or hit stale build issues:

```bash
docker compose build --no-cache && docker compose up
```

---

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Development server (`tsx server.ts`) |
| `npm run build` | Production Next.js build |
| `npm run start` | Production server (`tsx server.ts`) |
| `npm run lint` | ESLint |
| `npm run db:dedupe-projects` | One-off script to dedupe project names in SQLite (see script header) |
| `npm run test:redis` | Redis pub/sub + hot-cache checks (requires `REDIS_URL` and a running Redis; skips if unset) |

WebSocket / realtime test scripts: `npm run test:ws`, `test:broadcast`, `test:realtime`, etc. (see `package.json`).

This app does **not** use `next start` server alone; deployment needs a **Node** host that can run `server.ts` and accept WebSocket upgrades (not a typical static-only or purely serverless Next host without extra configuration).
