import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { attempts, deliveries, endpoints, events, subscriptions } from "@/db/schema";
import { currentProject } from "@/lib/project";
import { deleteEndpoint, rotateSecret, setEndpointState, updateEndpoint, updateSubscriptions } from "@/lib/actions/endpoints";
import { PageHeader } from "@/components/page-header";
import { Code, DeliveryStatus, EndpointState } from "@/components/pills";
import { Time } from "@/components/time";

export default async function EndpointPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const { project } = await currentProject();
  const ep = await db.query.endpoints.findFirst({ where: and(eq(endpoints.id, id), eq(endpoints.projectId, project.id)) });
  if (!ep) notFound();
  const subs = await db.select().from(subscriptions).where(eq(subscriptions.endpointId, ep.id));
  const recent = await db
    .select({ d: deliveries, type: events.type })
    .from(deliveries)
    .innerJoin(events, eq(events.id, deliveries.eventId))
    .where(eq(deliveries.endpointId, ep.id))
    .orderBy(desc(deliveries.createdAt))
    .limit(25);
  const lastAttempt = await db.select().from(attempts).innerJoin(deliveries, eq(deliveries.id, attempts.deliveryId)).where(eq(deliveries.endpointId, ep.id)).orderBy(desc(attempts.startedAt)).limit(1);

  return (
    <div>
      <PageHeader title={ep.url} sub={ep.description ?? undefined}>
        <EndpointState state={ep.state} />
        <form action={setEndpointState}>
          <input type="hidden" name="id" value={ep.id} />
          <input type="hidden" name="state" value={ep.state === "paused" ? "active" : "paused"} />
          <button className="btn">{ep.state === "paused" ? "Resume" : "Pause"}</button>
        </form>
      </PageHeader>

      {created && (
        <div className="card mb-6 border-acc/40 p-4 text-sm">
          Endpoint created. Put the signing secret below in the receiver&apos;s environment as <code className="font-mono">TETHER_SECRET</code>.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="font-semibold">Signing secret</h2>
          <code className="mt-2 block select-all break-all rounded-md bg-bg px-3 py-2 font-mono text-xs">{ep.secret}</code>
          {ep.previousSecret && ep.previousSecretExpiresAt && ep.previousSecretExpiresAt > new Date() && (
            <p className="mt-2 text-xs text-ink2">Previous secret still accepted until <Time d={ep.previousSecretExpiresAt} />. Deliveries carry both signatures.</p>
          )}
          <form action={rotateSecret} className="mt-3"><input type="hidden" name="id" value={ep.id} /><button className="btn">Rotate secret</button></form>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Subscriptions</h2>
          <p className="mt-1 text-xs text-ink2">Exact types, prefixes like <code className="font-mono">order.*</code>, or <code className="font-mono">*</code> for everything.</p>
          <form action={updateSubscriptions} className="mt-3">
            <input type="hidden" name="id" value={ep.id} />
            <textarea name="types" rows={3} className="input font-mono text-xs" defaultValue={subs.map((s) => s.eventType).join("\n")} />
            <button className="btn mt-2">Save</button>
          </form>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Settings</h2>
          <form action={updateEndpoint} className="mt-3 space-y-3">
            <input type="hidden" name="id" value={ep.id} />
            <div><label className="block text-xs font-medium text-ink2" htmlFor="description">Description</label><input id="description" name="description" className="input mt-1" defaultValue={ep.description ?? ""} /></div>
            <div><label className="block text-xs font-medium text-ink2" htmlFor="rate_limit">Rate limit (requests/second)</label><input id="rate_limit" name="rate_limit" type="number" min={1} className="input mt-1 font-mono" defaultValue={ep.rateLimitPerSecond ?? ""} placeholder="none" /></div>
            <button className="btn">Save</button>
          </form>
          <dl className="mt-4 grid grid-cols-[150px_1fr] gap-y-1 text-xs">
            <dt className="text-dim">Consecutive failures</dt><dd className="font-mono">{ep.consecutiveFailures}</dd>
            <dt className="text-dim">Breaker opened</dt><dd className="font-mono"><Time d={ep.breakerOpenedAt} /></dd>
            <dt className="text-dim">Last attempt</dt><dd className="font-mono"><Time d={lastAttempt[0]?.attempts.startedAt} /></dd>
            <dt className="text-dim">Created</dt><dd className="font-mono"><Time d={ep.createdAt} /></dd>
          </dl>
          <form action={deleteEndpoint} className="mt-4"><input type="hidden" name="id" value={ep.id} /><button className="btn-danger text-xs">Delete endpoint</button></form>
        </section>
      </div>

      <section className="card mt-5 overflow-x-auto">
        <div className="border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-dim">Recent deliveries</div>
        <table className="w-full text-sm">
          <thead className="border-b border-line"><tr><th className="th">Event</th><th className="th">Type</th><th className="th">Status</th><th className="th">Attempts</th><th className="th">Last</th><th className="th">Next</th><th className="th">Created</th></tr></thead>
          <tbody>
            {recent.length === 0 && <tr><td className="td py-8 text-center text-dim" colSpan={7}>Nothing delivered to this endpoint yet.</td></tr>}
            {recent.map(({ d, type }) => (
              <tr key={d.id} className="border-b border-line last:border-0 hover:bg-bg">
                <td className="td"><Link href={`/events/${d.eventId}`} className="font-mono text-xs hover:text-acc">{d.eventId}</Link></td>
                <td className="td font-mono text-xs">{type}</td>
                <td className="td"><DeliveryStatus status={d.status} /></td>
                <td className="td tnum font-mono text-xs">{d.attempt} / {d.maxAttempts}</td>
                <td className="td"><Code code={d.lastStatusCode} error={d.lastError} /></td>
                <td className="td">{d.status === "pending" ? <Time d={d.nextAttemptAt} /> : <span className="text-dim">—</span>}</td>
                <td className="td"><Time d={d.createdAt} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
