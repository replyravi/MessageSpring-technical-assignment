# Shopwave — E-commerce Mini-App

A small but production-shaped e-commerce product catalog. Built to demonstrate
secure authentication, persistent sessions with an inactivity timeout,
efficient cursor-based pagination, and a CI pipeline that actually validates
the code on every push.

> **Stack:** Next.js 14 (App Router) · NestJS 10 · PostgreSQL 16 · Prisma 5 · TypeScript

---

## Table of contents

1. [Repo layout](#repo-layout)
2. [Running locally](#running-locally)
3. [Demo account](#demo-account)
4. [Architecture notes](#architecture-notes)
   - [Sessions & security](#sessions--security)
   - [Infinite scroll & pagination](#infinite-scroll--pagination)
   - [Frontend state](#frontend-state)
5. [Configuration](#configuration)
6. [Testing](#testing)
7. [CI/CD](#cicd)
8. [What I would add next](#what-i-would-add-next)

---

## Repo layout

```
.
├── backend/                NestJS API (Prisma + Postgres)
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src/
│       ├── auth/           login, logout, AuthGuard, brute-force protection
│       ├── sessions/       session store, idle timeout, scheduled pruning
│       ├── products/       cursor-paginated catalog API
│       ├── users/          user lookups + argon2 verification
│       └── health/         liveness probe
├── frontend/               Next.js 14 (App Router)
│   └── src/
│       ├── app/            routes: / (catalog), /login
│       ├── components/     ProductCard + skeleton
│       ├── hooks/          useInfiniteProducts
│       └── lib/            api client + AuthProvider
├── .github/workflows/      CI pipeline
└── docker-compose.yml      one-command local stack
```

---

## Running locally

### Option A — Docker (recommended)

```bash
docker compose up --build
```

Wait for the API to apply migrations and seed, then open
**http://localhost:3000**.

The first run will:

1. Start Postgres.
2. Build & start the API. The container runs `prisma migrate deploy` on boot,
   but the very first boot also needs migrations to exist. See
   [First-time setup](#first-time-setup) below if you want to generate them.
3. Build & start the web app.

> The Docker entrypoint runs `prisma migrate deploy`, which only applies
> **existing** migration files. To create the initial migration locally,
> run Option B once first (see below), then `docker compose up` will apply it.

### First-time setup (one-off, generates the migration)

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate dev --name init      # creates prisma/migrations/*
npm run prisma:seed                     # inserts demo user + 200 products
```

### Option B — Native (faster feedback loop)

You need Postgres running on `localhost:5432`. The quickest way:

```bash
docker run -d --name ecom-pg \
  -e POSTGRES_USER=ecom -e POSTGRES_PASSWORD=ecom -e POSTGRES_DB=ecom \
  -p 5432:5432 postgres:16-alpine
```

Then in two terminals:

```bash
# terminal 1 — API
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npm run prisma:seed
npm run dev          # http://localhost:4000

# terminal 2 — Web
cd frontend
npm install
npm run dev          # http://localhost:3000
```

---

## Demo account

```
Email:    demo@example.com
Password: Password123!
```

Created by `prisma/seed.ts`. Override the password with
`SEED_USER_PASSWORD=... npm run prisma:seed`.

---

## Architecture notes

### Sessions & security

This is the part the brief calls out specifically, so here's the reasoning:

**Why cookie-based sessions and not JWT?** The requirement is "users stay
logged in across browser restarts, but the session auto-invalidates after 30
minutes of inactivity." That maps cleanly onto a **server-side session store**:

- The cookie is an opaque, random 256-bit token. Even if it leaks, it can be
  revoked server-side instantly (JWT can't, without a denylist).
- The session row carries `lastSeenAt`. Every authenticated request bumps it
  (rolling session). If `now - lastSeenAt > 30min`, the session is revoked
  lazily on the next request and the user must re-authenticate. That
  satisfies the inactivity timeout **even if the user keeps the tab open in
  the background**.
- A scheduled job (`SessionsScheduler`, every 30 min) GCs revoked/expired
  rows so the table stays small.

| Threat | Mitigation |
| --- | --- |
| Brute-force login | Per-(email+IP) counter; 5 failures → 5-minute lockout. Plus a global `@nestjs/throttler` rate limit (60 req / 15s / IP). |
| User enumeration via timing | Even when the email is unknown we run an `argon2.verify` against a dummy hash so response time is roughly constant. |
| Password storage | `argon2id` (memory-hard). |
| Cookie theft | `HttpOnly`, `SameSite=Lax`, `Secure` flag toggled by `COOKIE_SECURE` (on in prod). Token is high-entropy and revocable. |
| XSS in the SPA | No `dangerouslySetInnerHTML`, no inline scripts; `helmet` hardens response headers. |

The frontend mirrors the timeout for UX (so the user is bounced to `/login`
without waiting for a 401), but **the backend is the source of truth** —
closing all tabs for 31 minutes will always invalidate the session.

### Infinite scroll & pagination

The catalog endpoint is **cursor-paginated**, not offset-paginated:

```
GET /products?cursor=42&limit=20
→ { items: [...], nextCursor: 67, hasMore: true }
```

Why cursor over `LIMIT/OFFSET`?

- **Stable under writes.** If a product is inserted while the user scrolls,
  offsets shift and items get skipped or duplicated. A cursor on a monotonic
  `id` doesn't.
- **Constant cost.** `WHERE id > cursor ORDER BY id LIMIT n` is an index
  range scan — `O(limit)`, regardless of how deep the user scrolls. Offset
  pagination gets slower the further down you go.

The frontend uses a single `IntersectionObserver` pointed at a sentinel
`<div>` with a `400px` root margin so the next page starts loading just
**before** the user reaches the bottom — the list feels instant. A "Load
more" button is kept as a fallback for reduced-motion / older browsers.

**Page size is user-configurable** (5 / 10 / 20 / 30 / 50). The choice is
persisted in `localStorage` and clamped server-side to `[5, 50]` by
`class-validator` (`@Min(5) @Max(50)`), so a crafty client can't ask for
10,000 rows.

### Frontend state

- `AuthProvider` (React Context) owns auth state and the client-side idle
  timer. It also polls `/sessions/me` once a minute so a logout in another
  tab is picked up quickly.
- `useInfiniteProducts` owns the list state and exposes a `loadMore()`. It
  guards against the React 18 StrictMode double-fire and concurrent fetches
  with an `inFlight` ref.
- All data fetching is client-side on purpose. The catalog is gated behind
  auth, and SSR would need to forward the cookie through Next.js — fine, but
  more moving parts than this brief needs.

---

## Configuration

Environment variables (backend `.env`, see `.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | Postgres connection string (required) |
| `PORT` | `4000` | API port |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated allowed origins |
| `COOKIE_SECURE` | `false` | Set `true` in prod (HTTPS only) |
| `SESSION_IDLE_MS` | `1800000` | **30-min inactivity timeout** |
| `SESSION_TTL_MS` | `28800000` | 8-hour absolute cap on a session |
| `LOGIN_MAX_ATTEMPTS` | `5` | Before the lockout kicks in |
| `LOGIN_LOCK_MS` | `300000` | Lockout duration (5 min) |

---

## Testing

```bash
cd backend
npm test            # Jest unit tests (e.g. ProductsService pagination math)
```

The unit test in `products.service.spec.ts` locks in the cursor-pagination
contract (`limit + 1` fetch, correct `nextCursor`, `hasMore` flag).

---

## CI/CD

`.github/workflows/ci.yml` runs on every push and PR to `main`:

1. **Backend job** — spins up a Postgres service container, runs
   `prisma generate`, lint, unit tests, and `nest build`.
2. **Frontend job** — `npm ci`, lint, `next build`.
3. **Docker job** — once the above pass, builds both Docker images to catch
   Dockerfile / layer drift.

This covers the "basic CI/CD pipeline" requirement: lint + test + build on
every change, plus container build validation. To extend to a real deploy,
add a fourth job that pushes the image to a registry and triggers the
platform deploy (ECS / Fly / Render / k8s) on `main` builds.

---

## What I would add next

With more than the suggested 3 hours, in rough priority order:

- **Refresh tokens / sliding absolute lifetime.** Right now the absolute cap
  is 8h; a refresh-token flow would let long sessions continue without
  re-entering the password while still rotating the credential.
- **Rate limit on the login endpoint specifically** (stricter than the
  global one), backed by Redis so it works across multiple API instances.
- **Image optimization.** Replace picsum with real `next/image`-served assets
  and AVIF/WebP variants.
- **E2E tests** with Playwright covering login → scroll → idle timeout.
- **Observability**: structured logs (pino), `/metrics` for Prometheus, and
  a Sentry DSN on the frontend.
