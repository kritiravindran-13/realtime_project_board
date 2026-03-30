# Realtime project board

Next.js app with a **custom Node server** (`server.ts`) that serves the app and a **WebSocket** endpoint at `/api/ws`, plus **Prisma** and **SQLite** for projects, tasks, comments, and dependencies.

## Architecture & design

### Architecture decisions

- **Single custom Node entry (`server.ts`)** — The app is not served by `next start` alone. One process owns both the Next request handler and a `ws` WebSocket server on `/api/ws`, so HTTP API routes and upgrades share one runtime. That avoids splitting WebSocket concerns across serverless functions and keeps subscription state in memory on each instance (see tradeoffs below).

- **REST APIs + typed events** — Mutations go through normal REST handlers (`/api/tasks`, etc.). The database is the source of truth. After a successful write, the server emits a **structured realtime envelope** (`RealtimeMessage`: task / comment / project) so clients can patch or invalidate without a second protocol.

- **SQLite via Prisma** — Chosen for zero external dependencies in dev and simple Docker deploys. The schema models projects, tasks, comments, users, and task dependencies; Prisma keeps queries and migrations maintainable.

### Data flow and synchronization strategy

1. **Initial load** — The client uses **TanStack Query** to `GET` resources (e.g. `GET /api/tasks?projectId=…`). That result is cached under a stable query key (`["tasks", projectId]`).

2. **Realtime channel** — The browser opens **one WebSocket per active `projectId`** (ref-counted in `src/lib/realtime/ws-hub.ts`), then sends `subscribe` with that id. The server registers the socket in a **project-scoped set** and pushes JSON frames `{ topic: "project", payload: RealtimeMessage }`.

3. **After a mutation** — The API handler updates the DB, then calls **`publishTaskEvent` / `publishCommentEvent` / `publishProjectEvent`**. Subscribers receive the event. For the task list, the client **merges** task-shaped events into the cached list when possible; for project-wide or comment events, or when merge is unsafe, it **invalidates** the query so the next read refetches from the API.

4. **Optional Redis path** — If `REDIS_URL` is set, publishes go to **Redis pub/sub** first; each Node process runs a **subscriber** that forwards to its local WebSocket subscribers. That is how multiple app instances stay in sync without every instance talking to the DB just to broadcast. A **hot task list** key in Redis can satisfy `GET /api/tasks` without hitting SQLite on every read, updated by merging task events after writes (see tradeoffs).

### How sync is handled (client and server)

- **Server** — Persistence is always through Prisma; realtime is **notify-only** (events carry payload to update UIs, not to skip the DB on writes).

- **Client** — Sync is **“server state + realtime hints”**: Query holds authoritative snapshots from HTTP; WebSocket events either **merge** into that cache (task create/update/status/dependencies/delete) or **trigger refetch** when the event implies broader inconsistency (e.g. comments, project metadata).

- **Conflict handling** — There is no CRDT for tasks; last write wins at the API. If a merge fails or looks ambiguous, the client falls back to **invalidate + refetch**.

### How to scale the system over time

| Stage | Direction |
|--------|-----------|
| **Single instance** | Default: in-memory WebSocket registry, SQLite file. Enough for demos and moderate single-host traffic. |
| **Multiple Node processes / hosts** | Add **Redis** (`REDIS_URL`) for pub/sub so every instance receives publishes and forwards to its own connected clients. Use a load balancer with **sticky sessions** for WebSockets if clients must hit the same box, *or* rely on Redis fanout so each instance only needs its own subscribers (still ensure WS upgrades reach *an* app instance). |
| **Database** | Move from **SQLite** to **Postgres** (or similar) for concurrent writers, backups, and managed hosting. Point `DATABASE_URL` at the new URL; Prisma eases migration. |
| **Redis** | Start with single Redis; later use managed Redis with replication / failover if pub/sub or cache becomes critical path. |
| **Heavy read traffic** | Hot cache keys + CDN for static assets; consider read replicas if you introduce Postgres. |

### Tradeoffs

- **Custom server** — Gains a clean WS story and shared code with API routes; **loses** one-click deploy to pure serverless/edge without replacing WebSockets (e.g. with a managed realtime service or separate WS service).

- **SQLite** — Simple and fast for development; **not** ideal for many concurrent writers or multi-region. I would plan a Postgres migration when scale requirements grow.

- **In-memory subscription maps per process** — Fast and simple; **without Redis**, scaling to multiple instances means clients only see events from the instance they’re connected to—**Redis pub/sub** addresses that for broadcasts.

- **Hot cache in Redis** — Reduces read load and can lag slightly under races; the code **merges** or **invalidates** on failure to avoid serving permanently stale lists.

### Technology choices and justifications

| Choice | Why |
|--------|-----|
| **Next.js (App Router)** | Modern React server components / routing, API routes colocated with UI, good DX. |
| **Prisma** | Schema-first model, type-safe client, straightforward SQLite → Postgres path. |
| **TanStack Query** | Standard cache keys, invalidation, and optimistic-style updates for REST + realtime. |
| **`ws`** | Lightweight WebSocket server integrated with the same Node HTTP upgrade path as Next. |
| **Redis (optional)** | Industry-standard pub/sub for cross-process broadcast; string cache for hot reads. |
| **tsx** | Run TypeScript for `server.ts` without a separate compile step in dev. |

---

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

## Redis (optional)

Set **`REDIS_URL`** in `.env` (see `.env.example`) when you run **multiple Node instances** or want the **hot task list cache** for `GET /api/tasks`. Without it, realtime stays in-process only.

**Run Redis locally**

- **Docker** (Docker Desktop must be running): `docker run --rm -p 6379:6379 redis:7-alpine`
- **Homebrew (macOS):** `brew install redis && brew services start redis`

Then set `REDIS_URL=redis://127.0.0.1:6379` and restart the app. Verify with `REDIS_URL=… npm run test:redis`.

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
