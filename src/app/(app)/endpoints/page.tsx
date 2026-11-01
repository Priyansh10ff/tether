import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { attempts, deliveries, endpoints, subscriptions } from "@/db/schema";
import { currentProject } from "@/lib/project";
import { createEndpoint } from "@/lib/actions/endpoints";
import { PageHeader } from "@/components/page-header";
import { EndpointState } from "@/components/pills";

export const metadata = { title: "Endpoints" };

export default async function EndpointsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { project } = await currentProject();
  const { error } = await searchParams;
  const since = new Date(Date.now() - 24 * 3600 * 1000);

  const rows = await db
    .select({
      ep: endpoints,
      subs: sql<string>`coalesce(string_agg(distinct ${subscriptions.eventType}, ', '), '')`,
      total: sql<number>`count(distinct ${attempts.id})`,
      ok: sql<number>`count(distinct ${attempts.id}) filter (where ${attempts.ok})`,
      p50: sql<number | null>`percentile_cont(0.5) within group (order by ${attempts.durationMs})`,
    })
    .from(endpoints)
    .leftJoin(subscriptions, eq(subscriptions.endpointId, endpoints.id))
    .leftJoin(deliveries, eq(deliveries.endpointId, endpoints.id))
    .leftJoin(attempts, sql`${attempts.deliveryId} = ${deliveries.id} and ${attempts.startedAt} > ${since}`)
    .where(eq(endpoints.projectId, project.id))
    .groupBy(endpoints.id)
    .orderBy(desc(endpoints.createdAt));

  return (
    <div>
      <PageHeader title="Endpoints" sub="Where events get delivered. Each endpoint has its own secret and subscriptions." />

      <form action={createEndpoint} className="card mb-6 grid gap-3 p-4 md:grid-cols-[2fr_2fr_1fr_auto]">
        <div>
          <label className="lbl" htmlFor="url">URL</label>
          <input id="url" name="url" required className="input font-mono text-xs" placeholder="https://api.acme.com/hooks/tether" />
          {error && <p className="mt-1 text-xs text-bad">{error}</p>}
        </div>
        <div>
          <label className="lbl" htmlFor="types">Event types</label>
          <input id="types" name="types" className="input font-mono text-xs" placeholder="order.*, refund.issued  (or *)" defaultValue="*" />
        </div>
        <div>
          <label className="lbl" htmlFor="rate_limit">Rate limit /s</label>
          <input id="rate_limit" name="rate_limit" type="number" min={1} className="input font-mono text-xs" placeholder="none" />
        </div>
        <div className="flex items-end"><button className="btn-pri">Add endpoint</button></div>
      </form>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th className="th">URL</th><th className="th">Subscribed</th><th className="th">State</th><th className="th">Success 24h</th><th className="th">p50</th><th className="th">Rate limit</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td className="td py-8 text-center text-dim" colSpan={6}>No endpoints yet.</td></tr>}
            {rows.map(({ ep, subs, total, ok, p50 }) => {
              const pct = Number(total) ? (Number(ok) / Number(total)) * 100 : null;
              return (
                <tr key={ep.id}>
                  <td className="td">
                    <Link href={`/endpoints/${ep.id}`} className="font-mono text-xs hover:text-acc">{ep.url}</Link>
                    {ep.description && <div className="text-xs text-dim">{ep.description}</div>}
                  </td>
                  <td className="td font-mono text-xs text-ink2">{subs || "—"}</td>
                  <td className="td"><EndpointState state={ep.state} /></td>
                  <td className="td">
                    {pct === null ? <span className="text-dim">no traffic</span> : (
                      <div className="flex items-center gap-2">
                        <span className="tnum w-14 font-mono text-xs">{pct.toFixed(1)}%</span>
                        <div className="h-1 w-24 rounded bg-line"><div className={`h-1 rounded ${pct < 80 ? "bg-bad" : pct < 98 ? "bg-warn" : "bg-ok"}`} style={{ width: `${pct}%` }} /></div>
                      </div>
                    )}
                  </td>
                  <td className="td font-mono text-xs">{p50 == null ? "—" : `${Math.round(Number(p50))} ms`}</td>
                  <td className="td font-mono text-xs">{ep.rateLimitPerSecond ? `${ep.rateLimitPerSecond}/s` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
