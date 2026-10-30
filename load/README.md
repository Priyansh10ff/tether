# Load testing

`load/ingest.js` pushes events at a constant arrival rate and asserts on ingest latency.
Run the full stack (`docker compose up`), seed a key (`npm run seed`), point a receiver at it
(`node examples/receiver/server.mjs`, add `http://host.docker.internal:4000/hooks` as an endpoint), then:

```
k6 run -e TETHER_API_KEY=tk_live_… -e RATE=500 -e DURATION=60s load/ingest.js
```

Record what you get on your hardware in the main README; numbers from someone else's laptop are not yours.
Things worth watching while it runs: `/api/metrics` (`tether_deliveries{status="pending"}` should stay flat,
not climb), Postgres CPU, and the worker log for `reaped` lines (which mean deliveries are timing out).
