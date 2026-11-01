# Changelog

## 0.2.0

- Config validated at boot (zod); production refuses weak admin password or session secret.
- Login rate limiting; constant-time password compare.
- Security headers including CSP, HSTS, frame denial.
- SSRF protection for endpoint URLs, re-checked at send time; response bodies capped at 4 KB.
- Ingest body cap (`MAX_EVENT_BYTES`, 413 beyond).
- Audit log for every admin action, shown in Settings.
- Worker heartbeats with delivered/failed counters; overview shows live workers.
- Per-endpoint attempt limit.
- `pglite://` database URLs for a no-Docker local setup with an in-process worker.
- Send-test-event page, mobile navigation, friendlier database-down screen.
- ESLint, CodeQL, Dependabot, Docker build in CI; non-root container with healthchecks.
- Per-key ingest rate limit with Retry-After; request ids and JSON access logs.
- Readiness probe (`/api/health?ready=1`) with backlog and worker counts; retention runs daily inside the worker.
- Send ping per endpoint, clickable event rows, retry-all-waiting, per-endpoint health on the overview, secrets revealed on demand instead of rendered.
- Landing page claims reduced to what the repo can back.

## 0.1.0

Initial release: ingest API, SKIP LOCKED worker, HMAC signatures with rotation, 7-step jittered retry, dead-letter queue with replay, ordering per key, per-endpoint rate limits, circuit breaker, dashboard, `@tether/node` SDK, `tether` CLI, OpenAPI spec, Prometheus metrics.
