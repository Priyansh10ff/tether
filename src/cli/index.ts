#!/usr/bin/env node
/**
 * tether — command line for a Tether server.
 *
 *   TETHER_URL=http://localhost:3000 TETHER_API_KEY=tk_live_… tether <command>
 *
 *   tether send TYPE [--data JSON] [--key IDEMPOTENCY_KEY] [--order ORDERING_KEY]
 *   tether tail [--status 503]            stream attempts as they happen
 *   tether dlq list                        dead-lettered deliveries
 *   tether dlq replay ID | --all           put them back on the queue
 *   tether event ID                        show an event with its deliveries and attempts
 */
const BASE = (process.env.TETHER_URL ?? "http://localhost:3000").replace(/\/$/, "");
const KEY = process.env.TETHER_API_KEY ?? "";

const C = { dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", reset: "\x1b[0m", bold: "\x1b[1m" };
const color = process.stdout.isTTY ? (c: keyof typeof C, s: string) => C[c] + s + C.reset : (_: string, s: string) => s;

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!KEY) fail("TETHER_API_KEY is not set");
  const res = await fetch(BASE + path, {
    method,
    headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) fail(`${res.status} ${json.error ?? res.statusText}`);
  return json;
}

function fail(msg: string): never {
  console.error(color("red", "error: ") + msg);
  process.exit(1);
}

function flag(args: string[], name: string) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function codeStr(code: number | null, error: string | null) {
  if (code === null) return color("red", (error ?? "error").slice(0, 12).padEnd(5));
  const c = code < 300 ? "green" : code < 500 ? "yellow" : "red";
  return color(c, String(code).padEnd(5));
}

const t = (d: string) => new Date(d).toTimeString().slice(0, 8);

type Attempt = { id: string; event_id: string; type: string; url: string; number: number; status_code: number | null; ok: boolean; error: string | null; duration_ms: number; started_at: string };

const commands: Record<string, (args: string[]) => Promise<void>> = {
  async send(args) {
    const type = args[0];
    if (!type) fail("usage: tether send TYPE [--data JSON] [--key K] [--order K]");
    let data: unknown = {};
    const raw = flag(args, "--data");
    if (raw) {
      try { data = JSON.parse(raw); } catch { fail("--data must be JSON"); }
    }
    const r = await api<{ id: string; deliveries?: number; duplicate?: boolean }>("POST", "/api/v1/events", {
      type, data, idempotency_key: flag(args, "--key"), ordering_key: flag(args, "--order"),
    });
    if (r.duplicate) console.log(`${color("yellow", "duplicate")}  ${r.id}`);
    else console.log(`${color("green", "queued")}     ${r.id}  → ${r.deliveries} ${r.deliveries === 1 ? "endpoint" : "endpoints"}`);
  },

  async tail(args) {
    const only = flag(args, "--status");
    let since = new Date(Date.now() - 60_000).toISOString();
    console.log(color("dim", `tailing attempts from ${BASE} · ctrl-c to stop`));
    for (;;) {
      const { data } = await api<{ data: Attempt[] }>("GET", `/api/v1/attempts?since=${encodeURIComponent(since)}&limit=200`);
      if (data.length) since = data[0].started_at;
      for (const a of data.reverse()) {
        if (only && String(a.status_code) !== only) continue;
        const host = a.url.replace(/^https?:\/\//, "").split("/")[0];
        console.log(`${color("dim", t(a.started_at))}  ${codeStr(a.status_code, a.error)} ${host.padEnd(28)} ${a.type.padEnd(24)} #${a.number}  ${color("dim", a.duration_ms + "ms")}${a.ok ? "" : color("dim", "  " + (a.error ?? ""))}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  },

  async dlq(args) {
    const sub = args[0] ?? "list";
    if (sub === "list") {
      const { data } = await api<{ data: Array<{ id: string; event_id: string; type: string; url: string; endpoint: { url: string }; attempt: number; last_status_code: number | null; last_error: string | null; dead_at: string }> }>("GET", "/api/v1/deliveries?status=dead&limit=200");
      if (!data.length) return console.log("dead-letter queue is empty");
      console.log(color("bold", `${"DELIVERY".padEnd(32)} ${"TYPE".padEnd(24)} ${"ENDPOINT".padEnd(30)} LAST   ATTEMPTS  DIED`));
      for (const d of data) {
        console.log(`${d.id.padEnd(32)} ${d.type.padEnd(24)} ${d.endpoint.url.replace(/^https?:\/\//, "").slice(0, 30).padEnd(30)} ${codeStr(d.last_status_code, d.last_error)}  ${String(d.attempt).padEnd(8)}  ${color("dim", new Date(d.dead_at).toLocaleString())}`);
      }
      return;
    }
    if (sub === "replay") {
      if (args[1] === "--all") {
        const { data } = await api<{ data: Array<{ id: string }> }>("GET", "/api/v1/deliveries?status=dead&limit=200");
        for (const d of data) await api("POST", `/api/v1/deliveries/${d.id}/replay`);
        return console.log(`${color("green", "replayed")} ${data.length} deliveries`);
      }
      if (!args[1]) fail("usage: tether dlq replay ID | --all");
      await api("POST", `/api/v1/deliveries/${args[1]}/replay`);
      return console.log(`${color("green", "replayed")} ${args[1]}`);
    }
    fail("usage: tether dlq [list | replay ID | replay --all]");
  },

  async event(args) {
    if (!args[0]) fail("usage: tether event ID");
    const e = await api<Record<string, unknown>>("GET", `/api/v1/events/${args[0]}`);
    console.log(JSON.stringify(e, null, 2));
  },
};

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === "help" || cmd === "--help") {
  console.log(`tether <command>\n\n  send TYPE [--data JSON] [--key K] [--order K]\n  tail [--status CODE]\n  dlq [list | replay ID | replay --all]\n  event ID\n\nenv: TETHER_URL (default http://localhost:3000), TETHER_API_KEY`);
  process.exit(0);
}
const run = commands[cmd];
if (!run) fail(`unknown command '${cmd}'`);
run(rest).catch((err) => fail(err instanceof Error ? err.message : String(err)));
