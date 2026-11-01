import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { attempts, deliveries, endpoints, events } from "@/db/schema";
import { currentProject } from "@/lib/project";
import { discardDelivery, replayDelivery } from "@/lib/actions/deliveries";
import { PageHeader } from "@/components/page-header";
import { Code, DeliveryStatus } from "@/components/pills";
import { Time } from "@/components/time";
import { AutoRefresh } from "@/components/auto-refresh";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await currentProject();
  const event = await db.query.events.findFirst({ where: and(eq(events.id, id), eq(events.projectId, project.id)) });
  if (!event) notFound();

  const dls = await db
    .select({ d: deliveries, url: endpoints.url, endpointId: endpoints.id })
    .from(deliveries)
    .innerJoin(endpoints, eq(endpoints.id, deliveries.endpointId))
    .where(eq(deliveries.eventId, event.id))
    .orderBy(asc(deliveries.createdAt));
  const attemptsByDelivery = new Map<string, (typeof attempts.$inferSelect)[]>();
  for (const { d } of dls) {
    attemptsByDelivery.set(d.id, await db.select().from(attempts).where(eq(attempts.deliveryId, d.id)).orderBy(asc(attempts.number)));
  }

  return (
    <div>
      <AutoRefresh ms={2000} />
      <PageHeader title={event.type} sub={event.id}>
        <Link href="/events" className="btn">← All events</Link>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {dls.map(({ d, url }) => {
            const list = attemptsByDelivery.get(d.id) ?? [];
            return (
              <section key={d.id} className="card">
                <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                  <Link href={`/endpoints/${d.endpointId}`} className="font-mono text-xs hover:text-acc">{url}</Link>
                  <DeliveryStatus status={d.status} attempt={d.attempt} />
                  <span className="tnum font-mono text-xs text-ink2">attempt {d.attempt} of {d.maxAttempts}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {d.status === "pending" && <span className="font-mono text-xs text-dim">next <Time d={d.nextAttemptAt} /></span>}
                    {(d.status === "pending" || d.status === "dead" || d.status === "discarded") && (
                      <form action={replayDelivery}><input type="hidden" name="id" value={d.id} /><button className="btn btn-sm">{d.status === "pending" ? "Retry now" : "Replay"}</button></form>
                    )}
                    {d.status === "dead" && (
                      <form action={discardDelivery}><input type="hidden" name="id" value={d.id} /><button className="btn-danger btn-sm">Discard</button></form>
                    )}
                  </span>
                </div>
                <ol className="divide-y divide-line">
                  {list.length === 0 && <li className="px-4 py-6 text-center text-sm text-dim">No attempts yet.</li>}
                  {list.map((a) => (
                    <li key={a.id} className="grid gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[14px_36px_1fr_auto] md:items-start">
                      <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${a.ok ? "bg-ok" : "bg-bad"}`} aria-hidden />
                      <span className="font-mono text-xs text-dim">#{a.number}</span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <Code code={a.statusCode} error={a.error} />
                          <span className="text-ink2">{a.ok ? "acknowledged" : a.error ?? `HTTP ${a.statusCode}`}</span>
                          <span className="font-mono text-xs text-dim">{a.durationMs} ms · {a.workerId}</span>
                        </div>
                        {a.responseBody && <pre className="mt-1.5 max-h-32 overflow-auto rounded-md bg-bg px-3 py-2 font-mono text-[11px] text-ink2">{a.responseBody}</pre>}
                      </div>
                      <Time d={a.startedAt} />
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
          {dls.length === 0 && <div className="card p-8 text-center text-sm text-dim">No endpoint was subscribed to this type when it arrived.</div>}
        </div>

        <aside className="space-y-5">
          <section className="card p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-dim">Event</h2>
            <dl className="mt-2 grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
              <dt className="text-dim">id</dt><dd className="break-all font-mono">{event.id}</dd>
              <dt className="text-dim">type</dt><dd className="font-mono">{event.type}</dd>
              <dt className="text-dim">received</dt><dd><Time d={event.createdAt} /></dd>
              <dt className="text-dim">idempotency</dt><dd className="break-all font-mono">{event.idempotencyKey ?? "—"}</dd>
              <dt className="text-dim">ordering key</dt><dd className="break-all font-mono">{event.orderingKey ?? "—"}</dd>
            </dl>
          </section>
          <section className="card p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-dim">Payload</h2>
            <pre className="mt-2 max-h-[480px] overflow-auto rounded-md bg-ink px-3 py-2 font-mono text-[11px] leading-relaxed text-white">{JSON.stringify(event.payload, null, 2)}</pre>
          </section>
        </aside>
      </div>
    </div>
  );
}
