// k6 load test for the ingest path.
//   k6 run -e TETHER_URL=http://localhost:3000 -e TETHER_API_KEY=tk_live_... load/ingest.js
// The worker drains the queue concurrently; watch /api/metrics while this runs.
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const latency = new Trend("ingest_latency_ms", true);

export const options = {
  scenarios: {
    steady: { executor: "constant-arrival-rate", rate: Number(__ENV.RATE || 500), timeUnit: "1s", duration: __ENV.DURATION || "60s", preAllocatedVUs: 50, maxVUs: 400 },
  },
  thresholds: {
    http_req_failed: ["rate<0.001"],
    ingest_latency_ms: ["p(95)<150", "p(99)<400"],
  },
};

const TYPES = ["order.paid", "order.created", "refund.issued", "invoice.finalized", "shipment.dispatched"];

export default function () {
  const type = TYPES[Math.floor(Math.random() * TYPES.length)];
  const res = http.post(
    `${__ENV.TETHER_URL || "http://localhost:3000"}/api/v1/events`,
    JSON.stringify({ type, data: { order_id: `ord_${__VU}_${__ITER}`, amount: 1999 }, ordering_key: `cust_${__VU % 50}` }),
    { headers: { "content-type": "application/json", authorization: `Bearer ${__ENV.TETHER_API_KEY}` } },
  );
  latency.add(res.timings.duration);
  check(res, { "202 queued": (r) => r.status === 202 });
  sleep(0.01);
}
