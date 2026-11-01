<p align="center">
  <img src="docs/overview.png" alt="Tether dashboard: delivery metrics, attempts per hour, per-endpoint health and a live attempt feed" width="900">
</p>

<h1 align="center">Tether</h1>

<p align="center">
  Self-hosted webhook delivery. Your app sends one event; Tether signs it, delivers it to every subscriber,<br>
  retries with backoff for a day, keeps order per key, trips a breaker when a receiver dies, and parks what fails so you can replay it.
</p>

<p align="center">
  <a href="https://github.com/Priyansh10ff/tether/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Priyansh10ff/tether/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/Priyansh10ff/tether/actions/workflows/codeql.yml"><img alt="CodeQL" src="https://github.com/Priyansh10ff/tether/actions/workflows/codeql.yml/badge.svg"></a>
  <img alt="Node 22" src="https://img.shields.io/badge/node-22-333">
  <img alt="Postgres only" src="https://img.shields.io/badge/dependency-postgres%20only-2447ff">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-333"></a>
</p>

---

## Quick start

```bash
git clone https://github.com/Priyansh10ff/tether && cd tether
docker compose up
```

Dashboard on <http://localhost:3000>. No Docker? Use the embedded database instead:

```bash
npm install
cp .env.example .env            # set DATABASE_URL=pglite://./.tether-data, ADMIN_PASSWORD, SESSION_SECRET
npm run db:migrate && npm run seed && npm run dev
```

Then create an API key in the dashboard and send something:

```bash
export TETHER_API_KEY=tk_live_…
npx tether send order.paid --data '{"order_id":"ord_1","amount":249900}'
npx tether tail
```

## What it guarantees

| When this happens | Tether does this |
|---|---|
| Receiver is down | Retries on a fixed schedule, 5 s · 30 s · 2 min · 10 min · 1 h · 6 h · 24 h, each with ±20 % jitter so a burst of failures does not return in the same second. |
| Receiver is dead, not slow | Circuit breaker per endpoint: ten consecutive 5xx or timeouts open it, one probe per minute, the first 2xx closes it. |
| Request is forged or replayed | `Tether-Signature` is HMAC-SHA256 over `timestamp.body`. The SDK compares in constant time and rejects anything older than 300 s. Rotation sends both signatures for 24 h. |
| Events arrive out of order | `ordering_key`: deliveries that share a key reach an endpoint one at a time, in creation order. Different keys run in parallel. |
| Your app sends twice | `idempotency_key`: same key within a project is one event. Receivers get a stable `Tether-Id` per delivery to dedupe on. |
| Receiver can take N requests/s | `rate_limit_per_second` per endpoint. Excess waits in the queue instead of producing 429s. |
| A worker is killed mid-send | Rows are claimed with `SELECT … FOR UPDATE SKIP LOCKED`; a dead worker's lease expires and another picks the row up. |
| Someone points an endpoint at your network | Private, loopback and link-local targets are refused, DNS is re-resolved right before each send, redirects are never followed, response bodies are capped at 4 KB. |
| It failed after everything | Dead-letter queue with payload, every attempt and every response body. Replay one, or all, from the dashboard, the API or the CLI. |

Each row above has a test in `tests/` that exercises the real SQL, not a mock.

## How it works

```mermaid
flowchart LR
  App[Your app] -- "POST /v1/events" --> API[Next.js API]
  API -- "1 event + N deliveries<br/>in one transaction" --> PG[(PostgreSQL)]
  W1[worker] -- "claim: FOR UPDATE SKIP LOCKED" --> PG
  W2[worker] --> PG
  W1 -- "signed POST" --> R1[receiver A]
  W2 -- "signed POST" --> R2[receiver B]
  W1 -- "attempt row + next_attempt_at" --> PG
  Dash[Dashboard] -- reads --> PG
```

Everything is a row. An **event** is stored once. Each subscribed endpoint gets a **delivery**, the unit of work, with a status, an attempt counter and `next_attempt_at`. Every try is an **attempt** row with status code, latency, response body and the worker that made it. The dashboard, the dead-letter queue and `/api/metrics` are views over those three tables.

The worker loop is one SQL statement that claims due rows and marks them `in_flight`, one HTTP request per row, then one transaction that records the attempt and either completes the delivery, schedules the next attempt, or dead-letters it. Ordering, rate limits and the breaker are enforced inside the claim query, so they hold across any number of workers without coordination.

## What breaks, and what happens

**Receiver returns 503 for an hour.** Attempts 1 to 5 fail over the first 12 minutes; the breaker opens after ten consecutive failures across that endpoint's deliveries; from then on one probe per minute goes out while everything else waits without burning attempts. When the receiver recovers the probe returns 200, the breaker closes and the backlog drains at the endpoint's rate limit.

**Worker is `kill -9`'d with eight deliveries in flight.** Those rows stay `in_flight` with a `claimed_at`. After the lease (2× delivery timeout + 5 s) `reapStaleClaims` returns them to `pending` and another worker takes them. A receiver may see one of them twice, which is why `Tether-Id` is stable across retries.

**Postgres restarts.** `/api/health` returns 503; the worker's claim query throws and the loop retries after the poll interval. Nothing is lost because nothing was acknowledged that was not committed.

**Receiver returns 404 or 422.** Not retried. A 4xx other than 408, 425 or 429 means the request itself is wrong, and sending it again will not change that. The delivery goes straight to the dead-letter queue with the response body so you can read why.

**A captured request is replayed at the receiver.** The SDK rejects any `Tether-Timestamp` older than five minutes, and the signature covers the timestamp, so it cannot be moved.

**The same event is POSTed twice.** With an `idempotency_key`, the second call returns `200 {duplicate: true}` with the original id and creates nothing. Without one, Tether takes you at your word and delivers both.

## Receiving events

`@tether/node` (`packages/node`, zero dependencies):

```ts
import { verify } from "@tether/node";

export async function POST(req: Request) {
  const event = await verify(req, process.env.TETHER_SECRET!);
  if (event.type === "order.paid") await fulfil(event.data);
  return new Response(null, { status: 200 });
}
```

Headers on every delivery:

| Header | Example | Meaning |
|---|---|---|
| `Tether-Id` | `dlv_01JB7Q4M8XKTZ…` | stable across retries; dedupe on it |
| `Tether-Timestamp` | `1761734400` | unix seconds |
| `Tether-Signature` | `v1=9f3c…[,v1=…]` | HMAC-SHA256 over `timestamp.body`; two during rotation |
| `Tether-Attempt` | `4` | 1-based |

Answer 2xx fast and do slow work afterwards; Tether times out after 8 s and counts that as a failure.

## API

Full spec at `/api/openapi.json`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/events` | queue an event: `{ type, data, idempotency_key?, ordering_key? }` → `202 { id, deliveries }` |
| `GET` | `/api/v1/events/:id` | event with its deliveries and attempts |
| `GET` | `/api/v1/deliveries?status=dead` | list, cursor paginated |
| `POST` | `/api/v1/deliveries/:id/replay` | back on the queue now |
| `GET` | `/api/v1/attempts?since=<iso>` | newest first; what `tether tail` polls |
| `GET` | `/api/health` · `?ready=1` | liveness · readiness (requires a worker heartbeat) |
| `GET` | `/api/metrics` | Prometheus text |

Authenticate with `Authorization: Bearer <api key>`. Every response carries `x-request-id`.

## CLI

```
tether send TYPE [--data JSON] [--key IDEMPOTENCY_KEY] [--order ORDERING_KEY]
tether tail [--status 503]
tether dlq list | replay ID | replay --all
tether event ID
```

Reads `TETHER_URL` (default `http://localhost:3000`) and `TETHER_API_KEY`.

## Configuration

All settings are read from the environment and validated at boot; a bad value stops the process and names the key.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://tether:tether@localhost:5433/tether` | `postgres://` for a server, `pglite://<dir>` for embedded (single process) |
| `ADMIN_PASSWORD` | required | dashboard login; 12+ characters in production |
| `SESSION_SECRET` | required | signs the session cookie; 32+ characters in production |
| `WORKER_CONCURRENCY` | `8` | deliveries in flight per worker |
| `WORKER_POLL_MS` | `500` | idle poll interval |
| `DELIVERY_TIMEOUT_MS` | `8000` | per-attempt HTTP timeout |
| `BREAKER_THRESHOLD` / `BREAKER_PROBE_MS` | `10` / `60000` | failures to open the breaker; probe interval |
| `MAX_EVENT_BYTES` | `262144` | ingest body cap (413 beyond) |
| `INGEST_RATE_PER_KEY` | `1000` | requests per second per API key (429 beyond) |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_WINDOW_MS` | `10` / `900000` | login brute-force limit |
| `ALLOW_PRIVATE_ENDPOINTS` | `0` in production, `1` otherwise | allow localhost and private endpoint URLs |
| `RETENTION_BODY_DAYS` / `RETENTION_EVENT_DAYS` | `7` / `30` | daily job run by the worker |
| `WORKER_INLINE` | unset | `1` runs the worker inside the Next.js process |

## Running in production

The Docker image serves both roles: `app` (dashboard and API) and `worker` (`npm run worker`). Run `app` behind TLS and as many `worker` replicas as you like against any Postgres (Supabase, Neon, RDS, a VM). The dashboard can live on Vercel; the worker cannot, it is a long-lived loop and needs a real process (Fly, Railway, Render, a container anywhere).

Probes: `/api/health` for liveness, `/api/health?ready=1` for readiness. The container runs as a non-root user with a built-in healthcheck and dev dependencies pruned. Retention runs daily inside the worker. The threat model is in [SECURITY.md](SECURITY.md).

## Development

```bash
npm test             # 43 tests on an in-memory Postgres (PGlite) with the real migrations
npm run lint         # eslint, Next config
npx tsc --noEmit
```

Try the retry path end to end: `node examples/receiver/server.mjs` starts a receiver on `:4000` with `GET /down` and `GET /up` switches. Add `http://localhost:4000/hooks` as an endpoint, press **Send ping**, open `/down`, send again, watch the attempts, open `/up`.

```
src/engine/      ingest, claim, dispatch, retention   the part that matters
src/lib/         signing, retry schedule, breaker, url safety, env, audit
src/worker/      the loop
src/app/api/     public API, SSE stream, health, metrics, OpenAPI
src/app/(app)/   dashboard
src/cli/         tether command
packages/node/   @tether/node SDK
drizzle/         migrations
tests/           vitest + PGlite
load/            k6
```

## Limits worth knowing

Rate limiting and ordering are evaluated with correlated subqueries inside the claim query. That is correct and simple, and fine into the thousands of deliveries per second on one Postgres, but it is not free; at larger volumes the next step is a per-endpoint token table. The per-key ingest limit and the login limit are in-process counters, so with several app replicas each replica enforces its own budget. There is one admin login; multi-user auth is a later concern, which is why every table already hangs off a `projects` row and every action is already audited. No throughput figures are quoted here because none were measured on hardware that would mean anything to you; `load/` has the k6 script to measure on yours.

## Licence

MIT. Built by [Priyansh Dugar](https://github.com/Priyansh10ff).
