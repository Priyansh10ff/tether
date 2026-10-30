import type { Delivery, Endpoint } from "@/db/schema";

export function EndpointState({ state }: { state: Endpoint["state"] }) {
  const map = {
    active: ["bg-ok/10 text-ok", "healthy"],
    paused: ["bg-dim/15 text-ink2", "paused"],
    open: ["bg-bad/10 text-bad", "circuit open"],
  } as const;
  const [cls, label] = map[state];
  return <span className={`pill ${cls}`}>{label}</span>;
}

export function DeliveryStatus({ status }: { status: Delivery["status"] }) {
  const map = {
    pending: ["bg-warn/10 text-warn", "retrying"],
    in_flight: ["bg-acc/10 text-acc", "in flight"],
    succeeded: ["bg-ok/10 text-ok", "delivered"],
    dead: ["bg-bad/10 text-bad", "dead"],
    discarded: ["bg-dim/15 text-ink2", "discarded"],
  } as const;
  const [cls, label] = map[status];
  return <span className={`pill ${cls}`}>{label}</span>;
}

export function Code({ code, error }: { code: number | null; error?: string | null }) {
  if (code === null) return <span className="font-mono text-xs text-bad">{error ? "T/O" : "—"}</span>;
  const cls = code < 300 ? "text-ok" : code < 500 ? "text-warn" : "text-bad";
  return <span className={`font-mono text-xs font-medium ${cls}`}>{code}</span>;
}
