import { and, desc, eq, gt, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { attempts, deliveries, endpoints, events, workers } from "@/db/schema";
import { currentProject } from "@/lib/project";
import { PageHeader } from "@/components/page-header";
import { LiveFeed } from "@/components/live-feed";
import { HourChart } from "@/components/hour-chart";
import { ago } from "@/components/time";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const { project } = await currentProject();
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const pid = project.id;

  const [[a], [d], [circuit], [oldestDead], hours, recent, live] = await Promise.all([
    db.select({
      total: sql<number>`count(*)`,
      ok: sql<number>`count(*) filter (where ${attempts.ok})`,
      first: sql<number>`count(*) filter (where ${attempts.ok} and ${attempts.number} = 1)`,
      p50: sql<number | null>`percentile_cont(0.5) within group (order by ${attempts.durationMs})`,
      p99: sql<number | null>`percentile_cont(0.99) within group (order by ${attempts.durationMs})`,
    }).from(attempts).innerJoin(deliveries, eq(deliveries.id, attempts.deliveryId)).where(and(eq(deliveries.projectId, pid), gt(attempts.startedAt, since))),
    db.select({
      delivered: sql<number>`count(*) filter (where ${deliveries.status} = 'succeeded' and ${deliveries.deliveredAt} > ${since})`,
      retrying: sql<number>`count(*) filter (where ${deliveries.status} = 'pending' and ${deliveries.attempt} > 0)`,
      queued: sql<number>`count(*) filter (where ${deliveries.status} = 'pending' and ${deliveries.attempt} = 0)`,
      inflight: sql<number>`count(*) filter (where ${deliveries.status} = 'in_flight')`,
      dead: sql<number>`count(*) filter (where ${deliveries.status} = 'dead')`,
    }).from(deliveries).where(eq(deliveries.projectId, pid)),
    db.select({ n: sql<number>`count(*)` }).from(endpoints).where(and(eq(endpoints.projectId, pid), eq(endpoints.state, "open"))),
    db.select({ at: deliveries.deadAt }).from(deliveries).where(and(eq(deliveries.projectId, pid), eq(deliveries.status, "dead"))).orderBy(deliveries.deadAt).limit(1),
    db.select({
      hour: sql<string>`date_trunc('hour', ${attempts.startedAt})`,
      ok: sql<number>`count(*) filter (where ${attempts.ok})`,
      failed: sql<number>`count(*) filter (where not ${attempts.ok})`,
    }).from(attempts).innerJoin(deliveries, eq(deliveries.id, attempts.deliveryId)).where(and(eq(deliveries.projectId, pid), gt(attempts.startedAt, since))).groupBy(sql`1`).orderBy(sql`1`),
    db.select({ id: attempts.id, at: attempts.startedAt, code: attempts.statusCode, ok: attempts.ok, ms: attempts.durationMs, number: attempts.number, error: attempts.error, type: events.type, url: endpoints.url, eventId: events.id })
      .from(attempts).innerJoin(deliveries, eq(deliveries.id, attempts.deliveryId)).innerJoin(events, eq(events.id, deliveries.eventId)).innerJoin(endpoints, eq(endpoints.id, deliveries.endpointId))
      .where(eq(deliveries.projectId, pid)).orderBy(desc(attempts.startedAt)).limit(25),
    db.select({ id: workers.id, hostname: workers.hostname, concurrency: workers.concurrency, beat: workers.heartbeatAt, delivered: workers.delivered, failed: workers.failed }).from(workers).where(gt(workers.heartbeatAt, new Date(Date.now() - 30_000))),
  ]);

  // 24 hourly buckets ending now, zero-filled
  const byHour = new Map(hours.map((h) => [new Date(h.hour).getTime(), h]));
  const buckets = Array.from({ length: 24 }, (_, i) => {
    const hour = new Date(Date.now() - (23 - i) * 3600 * 1000);
    hour.setMinutes(0, 0, 0);
    const h = byHour.get(hour.getTime());
    return { hour, ok: Number(h?.ok ?? 0), failed: Number(h?.failed ?? 0) };
  });

  const total = Number(a.total), okN = Number(a.ok);
  const tiles = [
    { k: "Delivered, 24h", v: Number(d.delivered).toLocaleString(), s: `${Number(d.queued)} queued · ${Number(d.inflight)} in flight` },
    { k: "Success rate", v: total ? `${((okN / total) * 100).toFixed(2)}%` : "—", s: total ? `first attempt ${((Number(a.first) / total) * 100).toFixed(1)}%` : "no attempts yet", tone: total && okN / total < 0.98 ? "warn" : "ok" },
    { k: "p50 / p99 latency", v: a.p50 == null ? "—" : `${Math.round(Number(a.p50))} ms`, s: a.p99 == null ? "receiver response time" : `p99 ${Math.round(Number(a.p99))} ms` },
    { k: "In retry", v: Number(d.retrying).toLocaleString(), s: "waiting for next attempt", tone: Number(d.retrying) ? "warn" : undefined },
    { k: "Dead-lettered", v: Number(d.dead).toLocaleString(), s: oldestDead?.at ? `oldest ${ago(oldestDead.at)}` : "queue empty", tone: Number(d.dead) ? "bad" : undefined, href: "/dead-letters" },
    { k: "Circuit open", v: String(Number(circuit.n)), s: Number(circuit.n) ? "endpoints being probed" : "all endpoints healthy", tone: Number(circuit.n) ? "bad" : undefined, href: "/endpoints" },
  ];
  const workerCount = live.length;
  const slots = live.reduce((n, w) => n + w.concurrency, 0);

  return (
    <div>
      <PageHeader title="Overview" sub={`${project.name} · last 24 hours`}>
        <span className={`pill ${workerCount ? "bg-ok/10 text-ok" : "bg-bad/10 text-bad"}`} title={live.map((w) => `${w.id} on ${w.hostname}`).join("\n")}>
          {workerCount ? `${workerCount} worker${workerCount === 1 ? "" : "s"} · ${slots} slots` : "no worker running"}
        </span>
        <Link href="/endpoints" className="btn">Endpoints</Link>
        <Link href="/send" className="btn-pri">Send a test event</Link>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => {
          const tone = t.tone === "bad" ? "text-bad" : t.tone === "warn" ? "text-warn" : t.tone === "ok" ? "text-ok" : "text-ink";
          const inner = (
            <>
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[.1em] text-dim">
                {t.k}
                {t.tone && <span className={`h-1.5 w-1.5 rounded-full ${t.tone === "bad" ? "bg-bad" : t.tone === "warn" ? "bg-warn" : "bg-ok"}`} />}
              </div>
              <div className={`tnum mt-2 font-mono text-[26px] leading-none tracking-tight ${tone}`}>{t.v}</div>
              <div className="mt-2 truncate text-[12px] text-ink2">{t.s}</div>
            </>
          );
          const cls = "card p-4 transition hover:-translate-y-px hover:shadow-pop";
          return t.href ? <Link key={t.k} href={t.href} className={cls}>{inner}</Link> : <div key={t.k} className={cls}>{inner}</div>;
        })}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="card flex flex-col">
          <div className="card-h">
            Attempts per hour
            <span className="ml-auto flex gap-4 normal-case tracking-normal text-ink2"><span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm bg-ink" />ok</span><span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm bg-bad" />failed</span></span>
          </div>
          <div className="p-5"><HourChart buckets={buckets} /></div>
        </div>
        <LiveFeed projectId={pid} initial={recent.map((r) => ({ ...r, at: r.at.toISOString() }))} />
      </div>
    </div>
  );
}
