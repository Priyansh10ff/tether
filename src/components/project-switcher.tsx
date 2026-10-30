"use client";
import { useRef } from "react";

export function ProjectSwitcher({ action, current, projects }: { action: (fd: FormData) => Promise<void>; current: string; projects: { id: string; name: string }[] }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="relative">
      <label className="sr-only" htmlFor="project">Project</label>
      <select
        id="project"
        name="project"
        defaultValue={current}
        onChange={() => form.current?.requestSubmit()}
        className="h-9 w-full appearance-none rounded-[10px] border border-line bg-white pl-3 pr-8 text-[13px] font-medium text-ink shadow-[0_1px_2px_rgba(15,18,24,.05)] outline-none transition hover:border-line2 focus:border-acc focus:ring-4 focus:ring-acc/10"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-dim" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
    </form>
  );
}
