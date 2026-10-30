"use client";
import { useEffect, useState } from "react";

type Row = { id: string; at: string; code: number | null; ok: boolean; ms: number; number: number; error: string | null; type: string; url: string; eventId: string };

export function LiveFeed({ projectId, initial }: { projectId: string; initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const es = new EventSource(`/api/stream?project=${encodeURIComponent(projectId)}`);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (m) => {
      const r = JSON.parse(m.data) as Row;
      setRows((prev) => (prev.some((p) => p.id === r.id) ? prev : [r, ...prev].slice(0, 40)));
    };
    return () => es.close();
  }, [projectId]);

  return (
    <div className="card flex h-full flex-col">
      <div className="flex items-center border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-dim">
        Live attempts
        <span className={`ml-auto flex items-center gap-1.5 normal-case tracking-normal ${live ? "text-ok" : "text-dim"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-ok" : "bg-dim"}`} />{live ? "streaming" : "connecting"}
        </span>
      </div>
      <ul className="max-h-[420px] flex-1 overflow-auto font-mono text-[11.5px]">
        {rows.length === 0 && <li className="px-4 py-8 text-center text-dim">Waiting for the first attempt. Send an event to see it here.</li>}
        {rows.map((r) => (
          <li key={r.id} className="grid grid-cols-[60px_36px_1fr_auto] items-center gap-3 border-b border-line px-4 py-1.5 last:border-0">
            <span className="text-dim">{new Date(r.at).toTimeString().slice(0, 8)}</span>
            <span className={`font-medium ${r.ok ? "text-ok" : r.code === null ? "text-bad" : r.code >= 500 ? "text-bad" : "text-warn"}`}>{r.code ?? "T/O"}</span>
            <a href={`/events/${r.eventId}`} className="truncate text-ink2 hover:text-acc">{r.url.replace(/^https?:\/\//, "").split("/")[0]} · {r.type}{r.number > 1 ? ` · #${r.number}` : ""}</a>
            <span className="text-dim">{r.ms}ms</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
