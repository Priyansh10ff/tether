import Link from "next/link";
import { redirect } from "next/navigation";
import type { Project } from "@/db/schema";
import { setCurrentProject } from "@/lib/project";
import { destroySession } from "@/lib/session";
import { NavLink } from "./nav-link";

const NAV = [
  ["Overview", "/overview"],
  ["Events", "/events"],
  ["Endpoints", "/endpoints"],
  ["Dead letters", "/dead-letters"],
  ["API keys", "/keys"],
  ["Settings", "/settings"],
] as const;

export function Sidebar({ project, projects }: { project: Project; projects: Project[] }) {
  async function switchProject(formData: FormData) {
    "use server";
    await setCurrentProject(String(formData.get("project")));
    redirect("/overview");
  }
  async function logout() {
    "use server";
    await destroySession();
    redirect("/login");
  }
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-bg2 md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-line px-4 font-semibold">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <circle cx="5" cy="12" r="2.5" /><circle cx="19" cy="6" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M7.3 11 16.7 6.8M7.3 13l9.4 4.2" />
        </svg>
        Tether
      </div>
      <form action={switchProject} className="border-b border-line p-3">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-dim" htmlFor="project">Project</label>
        <select
          id="project"
          name="project"
          defaultValue={project.id}
          className="mt-1 w-full rounded-md border border-line2 bg-bg px-2 py-1.5 font-mono text-xs"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button className="btn mt-2 w-full justify-center py-1 text-xs">Switch</button>
      </form>
      <nav className="flex flex-col gap-0.5 p-2">
        {NAV.map(([label, href]) => (
          <NavLink key={href} href={href}>{label}</NavLink>
        ))}
      </nav>
      <div className="mt-auto border-t border-line p-3 text-xs text-dim">
        <form action={logout} className="flex items-center justify-between">
          <span className="font-mono">admin</span>
          <button className="text-ink2 hover:text-ink">Sign out</button>
        </form>
        <Link href="https://github.com/Priyansh10ff/tether" className="mt-2 block hover:text-ink">github.com/Priyansh10ff/tether</Link>
      </div>
    </aside>
  );
}
