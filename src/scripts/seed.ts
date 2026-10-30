import "@/db/env";
/**
 * Seed a demo project with endpoints, a key and a few hundred realistic deliveries so the
 * dashboard has something to show. Safe to run more than once.
 *
 *   npm run seed            -> prints the API key to use with the CLI / SDK
 */
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { apiKeys, attempts, deliveries, endpoints, events, projects, subscriptions } from "@/db/schema";
import { newApiKey } from "@/lib/apikeys";
import { newId } from "@/lib/ids";
import { newEndpointSecret } from "@/lib/signing";

const TYPES = ["order.paid", "order.created", "refund.issued", "invoice.finalized", "shipment.dispatched", "customer.updated"];
const EPS: Array<[string, string[], number | null, "active" | "open"]> = [
  ["https://api.acme.example/hooks/tether", ["order.*", "refund.*"], 200, "active"],
  ["https://billing.acme.example/webhooks", ["invoice.*"], 50, "active"],
  ["https://partners.shipfast.example/v2/events", ["shipment.*"], 20, "open"],
  ["https://analytics.acme.example/collect", ["*"], null, "active"],
];

async function main() {
  let project = await db.query.projects.findFirst({ where: eq(projects.slug, "acme-demo") });
  if (!project) {
    const id = newId.project();
    await db.insert(projects).values({ id, name: "acme-demo", slug: "acme-demo" });
    project = (await db.query.projects.findFirst({ where: eq(projects.id, id) }))!;
  }
  const { key, prefix, hash } = newApiKey();
  await db.insert(apiKeys).values({ id: newId.apiKey(), projectId: project.id, name: "seed", prefix, hash });

  const epIds: Array<{ id: string; state: "active" | "open"; types: string[] }> = [];
  for (const [url, types, rl, state] of EPS) {
    const id = newId.endpoint();
    await db.insert(endpoints).values({
      id, projectId: project.id, url, secret: newEndpointSecret(), rateLimitPerSecond: rl, state,
      consecutiveFailures: state === "open" ? 12 : 0,
      breakerOpenedAt: state === "open" ? new Date(Date.now() - 6 * 3600e3) : null,
      breakerProbeAt: state === "open" ? new Date(Date.now() + 60e3) : null,
    });
    await db.insert(subscriptions).values(types.map((eventType) => ({ id: newId.subscription(), endpointId: id, eventType })));
    epIds.push({ id, state, types });
  }

  const now = Date.now();
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const createdAt = new Date(now - Math.random() * 24 * 3600e3);
    const type = TYPES[Math.floor(Math.random() * TYPES.length)];
    const eventId = newId.event();
    await db.insert(events).values({ id: eventId, projectId: project.id, type, payload: { order_id: "ord_" + Math.random().toString(36).slice(2, 8), amount: Math.round(Math.random() * 50000) }, createdAt });
    for (const ep of epIds) {
      if (!ep.types.some((p) => p === "*" || p === type || (p.endsWith(".*") && type.startsWith(p.slice(0, -1))))) continue;
      const dead = ep.state === "open" && Math.random() < 0.35;
      const retrying = ep.state === "open" && !dead;
      const flaky = ep.state === "active" && Math.random() < 0.03;
      const tries = dead ? 7 : retrying ? 1 + Math.floor(Math.random() * 4) : flaky ? 2 : 1;
      const status = dead ? "dead" : retrying ? "pending" : "succeeded";
      const dId = newId.delivery();
      await db.insert(deliveries).values({
        id: dId, projectId: project.id, eventId, endpointId: ep.id, status, attempt: tries,
        nextAttemptAt: retrying ? new Date(now + Math.random() * 3600e3) : createdAt,
        lastStatusCode: status === "succeeded" ? 200 : 503, lastError: status === "succeeded" ? null : "HTTP 503",
        deliveredAt: status === "succeeded" ? new Date(createdAt.getTime() + 300) : null,
        deadAt: dead ? new Date(createdAt.getTime() + 7 * 3600e3) : null, createdAt,
      });
      for (let a = 1; a <= tries; a++) {
        const ok = status === "succeeded" && a === tries;
        await db.insert(attempts).values({
          id: newId.attempt(), deliveryId: dId, number: a, statusCode: ok ? 200 : 503, ok, error: ok ? null : "HTTP 503",
          responseBody: ok ? "ok" : "service unavailable", durationMs: ok ? 60 + Math.round(Math.random() * 200) : 8000,
          workerId: "seed-1", startedAt: new Date(createdAt.getTime() + a * 1000),
        });
      }
      n++;
    }
  }
  console.log(`seeded project "${project.name}" with ${epIds.length} endpoints and ${n} deliveries`);
  console.log(`API key (shown once): ${key}`);
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
