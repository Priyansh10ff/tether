import { sql } from "drizzle-orm";
import { db } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Prometheus text exposition. Scrape /api/metrics. */
export async function GET() {
  const [q, a] = await Promise.all([
    db.execute(sql`select status, count(*)::int as n from deliveries group by status`),
    db.execute(sql`
      select count(*)::int as total,
             count(*) filter (where ok)::int as ok,
             coalesce(percentile_cont(0.5) within group (order by duration_ms), 0) as p50,
             coalesce(percentile_cont(0.99) within group (order by duration_ms), 0) as p99
      from attempts where started_at > now() - interval '5 minutes'`),
  ]);
  const by = Object.fromEntries((q.rows as { status: string; n: number }[]).map((r) => [r.status, r.n]));
  const m = a.rows[0] as { total: number; ok: number; p50: number; p99: number };
  const lines = [
    "# HELP tether_deliveries Deliveries by status",
    "# TYPE tether_deliveries gauge",
    ...["pending", "in_flight", "succeeded", "dead", "discarded"].map((s) => `tether_deliveries{status="${s}"} ${by[s] ?? 0}`),
    "# HELP tether_attempts_5m Attempts in the last five minutes",
    "# TYPE tether_attempts_5m gauge",
    `tether_attempts_5m{result="ok"} ${m.ok}`,
    `tether_attempts_5m{result="failed"} ${m.total - m.ok}`,
    "# HELP tether_attempt_duration_ms_5m Receiver response time, last five minutes",
    "# TYPE tether_attempt_duration_ms_5m gauge",
    `tether_attempt_duration_ms_5m{quantile="0.5"} ${Number(m.p50).toFixed(0)}`,
    `tether_attempt_duration_ms_5m{quantile="0.99"} ${Number(m.p99).toFixed(0)}`,
  ];
  return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/plain; version=0.0.4" } });
}
