import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { endpoints, subscriptions } from "@/db/schema";
import { ingestEvent } from "@/engine";
import { currentProject } from "@/lib/project";
import { PageHeader } from "@/components/page-header";
import { audit } from "@/lib/audit";

export const metadata = { title: "Send a test event" };

async function send(formData: FormData) {
  "use server";
  const { project } = await currentProject();
  const type = String(formData.get("type") ?? "").trim();
  let data: unknown = {};
  try {
    data = JSON.parse(String(formData.get("data") || "{}"));
  } catch {
    redirect("/send?error=json&type=" + encodeURIComponent(type));
  }
  const r = await ingestEvent(db, {
    projectId: project.id,
    type,
    payload: data,
    idempotencyKey: String(formData.get("idempotency_key") ?? "").trim() || null,
    orderingKey: String(formData.get("ordering_key") ?? "").trim() || null,
  });
  if (r.status === "invalid") redirect("/send?error=type&type=" + encodeURIComponent(type));
  await audit(db, { projectId: project.id, actor: "admin", action: "event.send", target: r.eventId, detail: { type } });
  redirect(`/events/${r.eventId}`);
}

export default async function SendPage({ searchParams }: { searchParams: Promise<{ error?: string; type?: string }> }) {
  const { project } = await currentProject();
  const sp = await searchParams;
  const eps = await db
    .select({ url: endpoints.url, type: subscriptions.eventType, state: endpoints.state })
    .from(endpoints)
    .innerJoin(subscriptions, eq(subscriptions.endpointId, endpoints.id))
    .where(eq(endpoints.projectId, project.id));
  const suggestions = [...new Set(eps.map((e) => e.type).filter((t) => !t.includes("*")))];

  return (
    <div className="max-w-2xl">
      <PageHeader title="Send a test event" sub="Goes through the real ingest path: stored once, fanned out, signed, retried.">
        <Link href="/overview" className="btn">Cancel</Link>
      </PageHeader>

      {eps.length === 0 && (
        <div className="card mb-5 border-warn/40 p-4 text-sm">
          No endpoints yet, so this event will be stored but delivered nowhere. <Link href="/endpoints" className="font-medium text-acc">Add an endpoint first</Link>.
        </div>
      )}

      <form action={send} className="card p-6">
        <label className="lbl" htmlFor="type">Event type</label>
        <input id="type" name="type" required list="types" defaultValue={sp.type ?? suggestions[0] ?? "order.paid"} className="input font-mono" placeholder="order.paid" />
        <datalist id="types">{suggestions.map((t) => <option key={t} value={t} />)}</datalist>
        {sp.error === "type" && <p className="mt-1.5 text-xs text-bad">Types look like <code className="font-mono">order.paid</code>: lowercase, dot-separated.</p>}

        <label className="lbl mt-5" htmlFor="data">Payload (JSON)</label>
        <textarea id="data" name="data" rows={8} className="input font-mono text-xs" defaultValue={'{\n  "order_id": "ord_7f21a",\n  "amount": 249900,\n  "currency": "INR"\n}'} />
        {sp.error === "json" && <p className="mt-1.5 text-xs text-bad">That is not valid JSON.</p>}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="lbl" htmlFor="idempotency_key">Idempotency key <span className="font-normal text-dim">(optional)</span></label>
            <input id="idempotency_key" name="idempotency_key" className="input font-mono text-xs" placeholder="ord_7f21a:paid" />
          </div>
          <div>
            <label className="lbl" htmlFor="ordering_key">Ordering key <span className="font-normal text-dim">(optional)</span></label>
            <input id="ordering_key" name="ordering_key" className="input font-mono text-xs" placeholder="cust_48213" />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-xs text-ink2">Will be delivered to {eps.filter((e) => e.state !== "paused").length} subscription{eps.length === 1 ? "" : "s"} that match the type.</p>
          <button className="btn-pri">Send event</button>
        </div>
      </form>
    </div>
  );
}
