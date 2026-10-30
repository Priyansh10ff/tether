import { and, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { deliveries, endpoints, events } from "@/db/schema";
import { currentProject } from "@/lib/project";
import { discardDelivery, replayAllDead, replayDelivery } from "@/lib/actions/deliveries";
import { PageHeader } from "@/components/page-header";
import { Code } from "@/components/pills";
import { Time } from "@/components/time";

export const metadata = { title: "Dead letters" };

export default async function DeadLettersPage() {
  const { project } = await currentProject();
  const rows = await db
    .select({ d: deliveries, type: events.type, url: endpoints.url, endpointId: endpoints.id })
    .from(deliveries)
    .innerJoin(events, eq(events.id, deliveries.eventId))
    .innerJoin(endpoints, eq(endpoints.id, deliveries.endpointId))
    .where(and(eq(deliveries.projectId, project.id), eq(deliveries.status, "dead")))
    .orderBy(desc(deliveries.deadAt))
    .limit(200);

  const byEndpoint = await db
    .select({ id: endpoints.id, url: endpoints.url, n: sql<number>`count(*)` })
    .from(deliveries)
    .innerJoin(endpoints, eq(endpoints.id, deliveries.endpointId))
    .where(and(eq(deliveries.projectId, project.id), eq(deliveries.status, "dead")))
    .groupBy(endpoints.id)
    .orderBy(desc(sql`count(*)`));

  return (
    <div>
      <PageHeader title="Dead letters" sub="Deliveries that exhausted every attempt or hit a non-retryable response. Nothing here is lost.">
        {rows.length > 0 && (
          <form action={replayAllDead}><button className="btn-pri">Replay all {rows.length}</button></form>
        )}
      </PageHeader>

      {byEndpoint.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {byEndpoint.map((e) => (
            <form key={e.id} action={replayAllDead} className="card flex items-center gap-3 px-3 py-2 text-xs">
              <span className="font-mono">{e.url.replace(/^https?:\/\//, "")}</span>
              <span className="tnum font-mono text-bad">{e.n}</span>
              <input type="hidden" name="endpoint" value={e.id} />
              <button className="text-acc hover:underline">replay these</button>
            </form>
          ))}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th className="th">Event</th><th className="th">Type</th><th className="th">Endpoint</th><th className="th">Last response</th><th className="th">Attempts</th><th className="th">Died</th><th className="th"></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td className="td py-12 text-center text-dim" colSpan={7}>The dead-letter queue is empty.</td></tr>}
            {rows.map(({ d, type, url, endpointId }) => (
              <tr key={d.id}>
                <td className="td"><Link href={`/events/${d.eventId}`} className="font-mono text-xs hover:text-acc">{d.eventId}</Link></td>
                <td className="td font-mono text-xs">{type}</td>
                <td className="td max-w-56 truncate"><Link href={`/endpoints/${endpointId}`} className="font-mono text-xs text-ink2 hover:text-acc">{url.replace(/^https?:\/\//, "")}</Link></td>
                <td className="td"><Code code={d.lastStatusCode} error={d.lastError} /> <span className="text-xs text-ink2">{d.lastError}</span></td>
                <td className="td tnum font-mono text-xs">{d.attempt} / {d.maxAttempts}</td>
                <td className="td"><Time d={d.deadAt} /></td>
                <td className="td">
                  <div className="flex justify-end gap-2">
                    <form action={replayDelivery}><input type="hidden" name="id" value={d.id} /><button className="btn btn-sm">Replay</button></form>
                    <form action={discardDelivery}><input type="hidden" name="id" value={d.id} /><button className="btn-danger btn-sm">Discard</button></form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
