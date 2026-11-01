# Security

## Reporting

Email priyansh10work@gmail.com with "tether security" in the subject. Please do not open a public issue for anything exploitable. You will get a reply within 72 hours and a fix or a plan within two weeks for anything confirmed.

## What Tether does to protect you

**Outbound requests.** Endpoint URLs are attacker-controlled input to an HTTP client inside your network. Tether refuses `localhost`, private and link-local ranges, `.internal`/`.local` hostnames, non-http(s) schemes and URLs with embedded credentials, and resolves the hostname again right before each send so a DNS record that later points inward is still caught. Redirects are never followed. Response bodies are read to 4 KB and the stream is cancelled. Set `ALLOW_PRIVATE_ENDPOINTS=1` only for local development.

**Signatures.** Every delivery is signed with HMAC-SHA256 over `timestamp.body` using the endpoint's secret. The SDK compares in constant time and rejects timestamps outside a 300-second window. Rotating a secret keeps the previous one valid for 24 hours and sends both signatures.

**Dashboard.** Single admin password compared in constant time; login attempts are rate-limited per client address; the session is an HMAC-signed, HttpOnly, SameSite=Lax cookie. Server Actions are origin-checked by Next.js. Security headers are set on every response, including a CSP that allows no remote script hosts, `frame-ancestors 'none'`, HSTS and nosniff.

**API.** Keys are stored as SHA-256 hashes; only the prefix is ever shown again. Bodies are capped at `MAX_EVENT_BYTES` (256 KB) and answered with 413 beyond that. Every object is scoped to the key's project in the query, not after the fact.

**Configuration.** All settings are validated at boot. In production the admin password must be at least 12 characters and the session secret at least 32, or the process refuses to start.

**Container.** Runs as an unprivileged user with dev dependencies pruned.

## What it does not do (yet)

No multi-user auth or roles. No encryption of endpoint secrets at rest beyond what your Postgres provides. No per-key API rate limiting beyond the per-endpoint delivery limits. If any of these matter for your deployment, put Tether behind your own gateway and treat the dashboard as an internal tool.
