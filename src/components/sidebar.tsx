import Link from "next/link";
import { redirect } from "next/navigation";
import type { Project } from "@/db/schema";
import { setCurrentProject } from "@/lib/project";
import { destroySession } from "@/lib/session";
import { NavLink } from "./nav-link";
import { ProjectSwitcher } from "./project-switcher";

const NAV = [
  ["Overview", "/overview", "M4 19V5M4 19h16M8 15l3-4 3 2 4-6"],
  ["Events", "/events", "M4 7h16M4 12h10M4 17h13"],
  ["Endpoints", "/endpoints", "M5 12h2M17 12h2M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM12 3v2M12 19v2"],
  ["Dead letters", "/dead-letters", "M4 8h16v10H4zM4 8l8 6 8-6"],
  ["API keys", "/keys", "M15 7a4 4 0 1 1-2.6 7L7 19.4V21H4v-3l5.6-5.6A4 4 0 0 1 15 7Z"],
  ["Settings", "/settings", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12l2-1-1-3-2 .3-1.5-1.6.3-2.2L14 3l-1 2h-2L10 3 7.2 4.5l.3 2.2L6 8.3 4 8l-1 3 2 1v2l-2 1 1 3 2-.3 1.5 1.6-.3 2.2L10 21l1-2h2l1 2 2.8-1.5-.3-2.2 1.5-1.6 2 .3 1-3-2-1Z"],
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
    <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-line/80 bg-white/70 backdrop-blur-xl md:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-ink text-white shadow-[0_6px_16px_-6px_rgba(15,18,24,.6)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
            <circle cx="5" cy="12" r="2.5" /><circle cx="19" cy="6" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M7.3 11 16.7 6.8M7.3 13l9.4 4.2" />
          </svg>
        </span>
        <span className="text-[15px] font-semibold tracking-tight">Tether</span>
      </div>

      <div className="px-3 pb-2">
        <ProjectSwitcher action={switchProject} current={project.id} projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
      </div>

      <nav className="flex flex-col gap-0.5 px-3 pt-2">
        <div className="px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[.14em] text-dim">Delivery</div>
        {NAV.slice(0, 4).map(([label, href, d]) => (
          <NavLink key={href} href={href} icon={d}>{label}</NavLink>
        ))}
        <div className="px-2.5 pb-1.5 pt-4 text-[10.5px] font-semibold uppercase tracking-[.14em] text-dim">Configure</div>
        {NAV.slice(4).map(([label, href, d]) => (
          <NavLink key={href} href={href} icon={d}>{label}</NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-line/80 p-3">
        <div className="flex items-center justify-between rounded-[10px] px-2.5 py-2 text-xs">
          <span className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-acc/10 font-semibold text-acc">A</span>
            <span className="font-medium text-ink">admin</span>
          </span>
          <form action={logout}><button className="text-ink2 hover:text-ink">Sign out</button></form>
        </div>
        <Link href="https://github.com/Priyansh10ff/tether" className="mt-1 block truncate px-2.5 font-mono text-[11px] text-dim hover:text-ink">github.com/Priyansh10ff/tether</Link>
      </div>
    </aside>
  );
}
