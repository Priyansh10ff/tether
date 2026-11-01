import { and, desc, eq, ilike, lt, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { deliveries, endpoints, events } from "@/db/schema";
import { currentProject } from "@/lib/project";
import { PageHeader } from "@/components/page-header";
import { DeliveryStatus, Code } from "@/components/pills";
import { Time } from "@/components/time";
import { RowLink } from "@/components/row-link";
import { retryAllWaiting } from "@/lib/actions/deliveries";

export const metadata = { title: "Events" };

const STATUSES = ["all", "pending", "succeeded", "dead"] as const;
const PAGE = 50;

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; endpoint?: string; before?: string }> }) {
  const { project } = await currentProject();
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status! : "all";
  const q = (sp.q ?? "").trim();

  const where = and(
    eq(deliveries.projectId, project.id),
    status === "all" ? undefined : eq(deliveries.status, status as "pending" | "succeeded" | "dead"),
    sp.endpoint ? eq(deliveries.endpointId, sp.endpoint) : undefined,
    q ? (q.startsWith("evt_") || q.startsWith("dlv_") ? sql`(${events.id} = ${q} or ${deliveries.id} = ${q})` : ilike(events.type, q.replace(/\*/g, "%") + "%")) : undefined,
    sp.before ? lt(deliveries.createdAt, new Date(sp.before)) : undefined,
  );

  const rows = await db
    .select({ d: deliveries, type: events.type, url: endpoints.url })
    .from(deliveries)
    .innerJoin(events, eq(events.id, deliveries.eventId))
    .innerJoin(endpoints, eq(endpoints.id, deliveries.endpointId))
    .where(where)
    .orderBy(desc(deliveries.createdAt))
    .limit(PAGE + 1);
  const more = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  const eps = await db.select({ id: endpoints.id, url: endpoints.url }).from(endpoints).where(eq(endpoints.projectId, project.id));

  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ status, q, endpoint: sp.endpoint, ...patch })) if (v && v !== "all") p.set(k, v);
    const s = p.toString();
    return "/events" + (s ? "?" + s : "");
  };

  return (
    <div>
      <PageHeader title="Events" sub="One row per delivery: an event to one endpoint.">
        {status === "pending" && page.length > 0 && (
          <form action={retryAllWaiting}><button className="btn">Retry all waiting now</button></form>
        )}
      </PageHeader>
      <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
        <div className="flex rounded-lg border border-line2 bg-bg2 p-0.5">
          {STATUSES.map((s) => (
            <Link key={s} href={link({ status: s })} className={`rounded-md px-3 py-1 text-sm capitalize ${status === s ? "bg-ink text-white" : "text-ink2 hover:text-ink"}`}>
              {s === "pending" ? "retrying" : s === "succeeded" ? "delivered" : s}
            </Link>
          ))}
        </div>
        <input type="hidden" name="status" value={status} />
        <input name="q" defaultValue={q} placeholder="type (order.*) or evt_… id" className="input max-w-xs font-mono text-xs" />
        <select name="endpoint" defaultValue={sp.endpoint ?? ""} className="input max-w-xs font-mono text-xs">
          <option value="">all endpoints</option>
          {eps.map((e) => <option key={e.id} value={e.id}>{e.url}</option>)}
        </select>
        <button className="btn">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th className="th">Event</th><th className="th">Type</th><th className="th">Endpoint</th><th className="th">Status</th><th className="th">Attempts</th><th className="th">Last</th><th className="th">Next</th><th className="th">Received</th></tr></thead>
          <tbody>
            {page.length === 0 && <tr><td className="td py-10 text-center text-dim" colSpan={8}>No deliveries match.</td></tr>}
            {page.map(({ d, type, url }) => (
              <RowLink key={d.id} href={`/events/${d.eventId}`}>
                <td className="td"><span className="font-mono text-xs text-acc">{d.eventId}</span></td>
                <td className="td font-mono text-xs">{type}</td>
                <td className="td max-w-56 truncate font-mono text-xs text-ink2" title={url}>{url.replace(/^https?:\/\//, "")}</td>
                <td className="td"><DeliveryStatus status={d.status} /></td>
                <td className="td tnum font-mono text-xs">{d.attempt} / {d.maxAttempts}</td>
                <td className="td"><Code code={d.lastStatusCode} error={d.lastError} /></td>
                <td className="td">{d.status === "pending" ? <Time d={d.nextAttemptAt} /> : <span className="text-dim">—</span>}</td>
                <td className="td"><Time d={d.createdAt} /></td>
              </RowLink>
            ))}
          </tbody>
        </table>
      </div>
      {more && (
        <div className="mt-3 text-right">
          <Link className="btn" href={link({ before: page[page.length - 1].d.createdAt.toISOString() })}>Older →</Link>
        </div>
      )}
    </div>
  );
}
