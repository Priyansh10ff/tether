import type { DbStatus } from "@/lib/dbcheck";

export function DbDown({ status }: { status: Exclude<DbStatus, { ok: true }> }) {
  const title = {
    unreachable: "Postgres is not reachable",
    auth: "Postgres rejected the credentials",
    no_tables: "Database is empty",
    unknown: "Database error",
  }[status.reason];
  const steps = {
    unreachable: [
      "Start it: `docker compose up -d db` (Docker Desktop has to be running).",
      "Make sure `.env` points at the same port the container exposes: `postgres://tether:tether@localhost:5433/tether`.",
      "No Docker? Put `DATABASE_URL=pglite://./.tether-data` in `.env` for an embedded database.",
    ],
    auth: [
      "Something else is answering on that port, usually a local PostgreSQL install. Tether's container listens on 5433 to avoid it.",
      "If the Docker volume was created with other credentials: `docker compose down -v` then `docker compose up -d db`.",
    ],
    no_tables: ["Run `npm run db:migrate` once, then reload."],
    unknown: ["Check the terminal running `npm run dev` for the full error."],
  }[status.reason];
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="card w-full max-w-xl p-7 shadow-pop">
        <div className="pill bg-bad/10 text-bad">database</div>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 font-mono text-xs text-ink2">{status.target} · {status.detail}</p>
        <ol className="mt-5 space-y-2 text-sm text-ink2">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="font-mono text-dim">{i + 1}.</span>
              <span dangerouslySetInnerHTML={{ __html: s.replace(/`([^`]+)`/g, '<code class="rounded bg-bg px-1.5 py-0.5 font-mono text-[12px] text-ink">$1</code>') }} />
            </li>
          ))}
        </ol>
        <a href="" className="btn mt-6">Reload</a>
      </div>
    </main>
  );
}
