# Tether

Self-hosted webhook delivery. Your app sends one event; Tether signs it, delivers it to every subscribed endpoint, retries with backoff for a day, keeps order per key, trips a breaker when a receiver dies, and parks what fails so you can replay it. Postgres is the only dependency.

Built with Next.js 16, Drizzle and PostgreSQL. No Redis, no Kafka, no queue service.

```
git clone https://github.com/Priyansh10ff/tether && cd tether
docker compose up
```

Dashboard on http://localhost:3000 (password `tether` unless you set `ADMIN_PASSWORD`). No Docker? Set `DATABASE_URL=pglite://./.tether-data` in `.env` and `npm run dev` runs an embedded Postgres with the worker inside the app. Create an API key, add an endpoint, then:

```
TETHER_API_KEY=tk_live_… npx tether send order.paid --data '{"order_id":"ord_1"}'
TETHER_API_KEY=tk_live_… npx tether tail
```

## What it does

| Problem | What Tether does |
|---|---|
| Receiver is down | Retries on a fixed schedule: 5s, 30s, 2m, 10m, 1h, 6h, 24h, each with ±20% jitter so a burst of failures spreads out instead of returning in the same second. |
| Receiver is dead, not slow | Circuit breaker per endpoint. Ten consecutive 5xx/timeouts open it; one probe per minute; the first 2xx closes it. |
| Forged or replayed requests | `Tether-Signature`: HMAC-SHA256 over `timestamp.body`. The SDK compares in constant time and rejects anything older than 300 s. During secret rotation both signatures are sent for 24 h. |
| Events arrive out of order | `ordering_key`. Deliveries sharing a key reach an endpoint one at a time, in creation order. Different keys run in parallel. |
| Your app sends twice | `idempotency_key`. Same key within 24 h is one event. Receivers get a stable `Tether-Id` per delivery to dedupe on. |
| Receiver can only take N/s | `rate_limit_per_second` per endpoint. Excess waits in the queue instead of producing 429s. |
| A worker is killed mid-send | Deliveries are claimed with `SELECT … FOR UPDATE SKIP LOCKED`. A crashed worker's lease expires and another worker picks the row up. |
| It still failed after everything | Dead-letter queue with payload, every attempt and every response body. Replay one or all from the dashboard, the API or the CLI. |
| Someone points an endpoint at your metadata service | Endpoint URLs are checked against private, loopback and link-local ranges and re-resolved right before each send. Redirects are never followed; response bodies are capped at 4 KB. |
| A key leaks or a client goes haywire | Per-key ingest rate limit (429 with Retry-After), 256 KB body cap, keys stored hashed, every admin action in an audit log. |

## Architecture

```mermaid
flowchart LR
  App[Your app] -- "POST /v1/events<br/>Bearer api key" --> API[Next.js API]
  API -- "1 event + N deliveries<br/>in one transaction" --> PG[(PostgreSQL)]
  W1[worker] -- "claim: FOR UPDATE SKIP LOCKED" --> PG
  W2[worker] --> PG
  W1 -- "signed POST" --> R1[receiver A]
  W2 -- "signed POST" --> R2[receiver B]
  W1 -- "attempt row<br/>next_attempt_at" --> PG
  Dash[Dashboard] -- reads --> PG
```

Everything is a row. An **event** is stored once. Each subscribed endpoint gets a **delivery**, the unit of work, with a status (`pending`, `in_flight`, `succeeded`, `dead`, `discarded`), an attempt counter and `next_attempt_at`. Every try is an **attempt** row with status code, latency, response body and the worker that made it. The dashboard, the dead-letter queue and the metrics endpoint are all views over those three tables.

The worker loop is one SQL statement that claims due rows and marks them `in_flight`, then one HTTP request per row, then one transaction that records the attempt and either marks the delivery done, schedules the next attempt, or dead-letters it. Ordering, rate limits and the breaker are enforced inside the claim query, so they hold across any number of workers without coordination.

## What breaks, and what happens

**Receiver returns 503 for an hour.** Attempts 1–5 fail over the first 12 minutes; the breaker opens after ten consecutive failures across that endpoint's deliveries; from then on one probe per minute goes out while everything else waits without burning attempts. When the receiver comes back the probe returns 200, the breaker closes and the backlog drains at the endpoint's rate limit.

**Worker is `kill -9`'d with 8 deliveries in flight.** Those rows stay `in_flight` with a `claimed_at`. After the lease (2× delivery timeout + 5 s) `reapStaleClaims` flips them back to `pending`. Another worker claims them. A receiver may see one of them twice, which is why `Tether-Id` is stable across retries. `tests/guarantees.test.ts` covers this.

**Postgres restarts.** The API returns 503 from `/api/health`; the worker's claim query throws and the loop retries after the poll interval. Nothing is lost because nothing was acknowledged that was not committed.

**Receiver returns 404 / 422.** Not retried. A 4xx (other than 408/425/429) means the request itself is wrong, and sending it again will not change that. The delivery goes straight to the dead-letter queue with the response body so you can see why.

**Someone replays a captured request.** The SDK rejects any `Tether-Timestamp` older than five minutes, and the signature covers the timestamp, so it cannot be moved.

**The same event is POSTed twice.** With an `idempotency_key`, the second call returns `200 {duplicate: true}` with the original id and creates nothing. Without one, Tether takes you at your word and delivers both.

## Receiving events

Four lines with the SDK (`packages/node`, zero dependencies):

```ts
import { verify } from "@tether/node";

export async function POST(req: Request) {
  const event = await verify(req, process.env.TETHER_SECRET!);
  if (event.type === "order.paid") await fulfil(event.data);
  return new Response(null, { status: 200 });
}
```

Headers on every delivery:

```
Tether-Id:         dlv_01JB7Q4M8XKTZ…     stable across retries
Tether-Timestamp:  1761734400              unix seconds
Tether-Signature:  v1=9f3c…[,v1=…]         HMAC-SHA256(secret, "timestamp.body"), two during rotation
Tether-Attempt:    4
```

Answer 2xx fast and do slow work afterwards; Tether times out after 8 s (`DELIVERY_TIMEOUT_MS`) and counts that as a failure.

## API

Full spec at `/api/openapi.json`. The short version:

```
POST /api/v1/events                     { type, data, idempotency_key?, ordering_key? }  -> 202 { id, deliveries }
GET  /api/v1/events/:id                 event + deliveries + attempts
GET  /api/v1/deliveries?status=dead     list, cursor paginated
POST /api/v1/deliveries/:id/replay      back on the queue now
GET  /api/v1/attempts?since=<iso>       newest first (what `tether tail` polls)
GET  /api/health                        { ok, db_ms }
GET  /api/metrics                       Prometheus text
```

## CLI

```
tether send TYPE [--data JSON] [--key IDEMPOTENCY_KEY] [--order ORDERING_KEY]
tether tail [--status 503]
tether dlq list
tether dlq replay ID | --all
tether event ID
```

Reads `TETHER_URL` (default `http://localhost:3000`) and `TETHER_API_KEY`.

## Running it

**Local development**

```
docker compose up -d db   # Postgres on localhost:5433 (5433 so it never collides with a local install)
cp .env.example .env
npm install
npm run db:migrate
npm run dev        # dashboard + API on :3000
npm run worker     # in a second terminal
npm run seed       # optional: demo project with 24h of traffic, prints an API key
```

Try the retry path end to end: `node examples/receiver/server.mjs` starts a receiver on :4000 with `GET /down` and `GET /up` switches. Add `http://localhost:4000/hooks` as an endpoint, take it down, send an event, and watch `tether tail`.

**Production**

The Docker image serves both roles. Run `app` behind TLS and as many `worker` replicas as you like against any Postgres (Supabase, Neon, RDS, a VM). Set `ADMIN_PASSWORD`, `SESSION_SECRET` and `DATABASE_URL`; everything else has defaults. Schedule `npm run retention` daily to clear response bodies older than 7 days and purge delivered events older than 30 (dead-lettered events are never purged automatically).

The dashboard can run on Vercel. The worker cannot: it is a long-lived loop and needs a real process (Fly, Railway, Render, a container anywhere). `/api/health` is the liveness probe; `/api/health?ready=1` also requires a worker heartbeat in the last 30 seconds. The container runs as a non-root user with a built-in healthcheck. See `SECURITY.md` for the threat model.

## Configuration

Everything is read from the environment and validated at boot (`src/lib/env.ts`); a bad value stops the process with the offending key named.

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_URL` | `postgres://tether:tether@localhost:5433/tether` | `postgres://` for a server, `pglite://<dir>` for embedded (single process) |
| `ADMIN_PASSWORD` | required | dashboard login; 12+ characters in production |
| `SESSION_SECRET` | required | signs the session cookie; 32+ characters in production |
| `WORKER_CONCURRENCY` | 8 | deliveries in flight per worker |
| `WORKER_POLL_MS` | 500 | idle poll interval |
| `DELIVERY_TIMEOUT_MS` | 8000 | per-attempt HTTP timeout |
| `BREAKER_THRESHOLD` / `BREAKER_PROBE_MS` | 10 / 60000 | consecutive failures to open; probe interval |
| `MAX_EVENT_BYTES` | 262144 | ingest body cap (413 beyond) |
| `INGEST_RATE_PER_KEY` | 1000 | requests per second per API key (429 beyond) |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_WINDOW_MS` | 10 / 900000 | login brute-force limit |
| `ALLOW_PRIVATE_ENDPOINTS` | 0 in production, 1 otherwise | allow localhost/private endpoint URLs |
| `RETENTION_BODY_DAYS` / `RETENTION_EVENT_DAYS` | 7 / 30 | daily job run by the worker |
| `WORKER_INLINE` | unset | `1` runs the worker inside the Next.js process |

## Tests

```
npm test            # vitest on an in-memory Postgres (PGlite) with the real migrations
npm run lint        # eslint, Next config
npx tsc --noEmit
```

Forty-three tests cover the claim query (ordering, rate limits, breaker probes, stale-claim recovery), signing and rotation, the retry schedule, dead-lettering, retention, SSRF checks, config validation, login rate limiting, the SDK, and the HTTP API called as real route handlers. Nothing needs Docker to run the suite. CI runs lint, typecheck, tests, the Next build, the SDK pack, a Docker build and CodeQL on every push.

## Project layout

```
src/engine/      ingest, claim, dispatch, retention   the part that matters
src/lib/         signing, retry schedule, breaker, ids, auth
src/worker/      the loop
src/app/api/     public API + SSE stream + health + metrics
src/app/(app)/   dashboard pages
src/cli/         tether command
packages/node/   @tether/node SDK
drizzle/         migrations
tests/           vitest + PGlite
load/            k6
examples/        breakable receiver
```

## Limits worth knowing

Rate limiting and ordering are evaluated with correlated subqueries inside the claim query. That is correct and simple, and fine into the thousands of deliveries per second on one Postgres, but it is not free; at larger volumes the next step is a per-endpoint token table. The per-key ingest limit and the login limit are in-process counters, so with several app replicas each replica enforces its own budget. Idempotency keys are scoped per project and kept with the event, so a key reused after the event is purged by retention will be accepted again. There is one admin login; multi-user auth is a later concern, which is why every table already hangs off a `projects` row and every action is already audited. No throughput figures are quoted here because I have not measured on hardware that would mean anything to you; `load/` has the k6 script to measure on yours.

## Licence

MIT.
