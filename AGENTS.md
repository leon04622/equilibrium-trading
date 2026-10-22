# AGENTS.md

## Cursor Cloud specific instructions

This repository now contains the **Equilibrium Trades** app (Node 20, Express + Vite/React). It is a Hyperliquid trading UI with Stripe billing.

### Install

```bash
npm ci --no-audit --no-fund
```

If `npm ci` fails on peer deps, use `npm ci --legacy-peer-deps`.

### Dev server

```bash
cp -n .env.example .env
npm run dev
```

The API + Vite app listen on `PORT` (default **5000**). Postgres (`DATABASE_URL`) is optional; without it the server uses in-memory fallbacks. `GET /health` must return `{ "status": "ok" }`.

### Checks

```bash
npm run check    # tsc
npm run test     # vitest
npm run build    # client + dist/index.cjs
npm run verify   # typecheck, tests, build, HTTP smoke, Railway boot regression
```

### Railway

`railway.json` healthchecks `GET /health`. The HTTP server binds `0.0.0.0:$PORT` **before** Stripe schema migrations or Postgres table ensure, so a bad `DATABASE_URL` cannot 404 the replica.

Set on Railway: `DATABASE_URL`, `PUBLIC_APP_URL`, Stripe keys. See `HOSTING.md`.
