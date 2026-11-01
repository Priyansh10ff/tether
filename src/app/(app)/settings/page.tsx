import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLog, projects } from "@/db/schema";
import { Time } from "@/components/time";
import { newId } from "@/lib/ids";
import { currentProject, setCurrentProject } from "@/lib/project";
import { DEFAULT_SCHEDULE_SECONDS, JITTER } from "@/lib/retry";
import { SIGNATURE_TOLERANCE_SECONDS } from "@/lib/signing";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Settings" };

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";
}

async function rename(formData: FormData) {
  "use server";
  const { project } = await currentProject();
  const name = String(formData.get("name") ?? "").trim();
  if (name) await db.update(projects).set({ name }).where(eq(projects.id, project.id));
  revalidatePath("/", "layout");
}

async function createProject(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const id = newId.project();
  await db.insert(projects).values({ id, name, slug: slugify(name) + "-" + id.slice(-4).toLowerCase() });
  await setCurrentProject(id);
  redirect("/overview");
}

const fmt = (s: number) => (s === 0 ? "immediately" : s < 60 ? `${s}s` : s < 3600 ? `${s / 60}m` : `${s / 3600}h`);

export default async function SettingsPage() {
  const { project } = await currentProject();
  const log = await db.select().from(auditLog).where(eq(auditLog.projectId, project.id)).orderBy(desc(auditLog.createdAt)).limit(50);
  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" />
      <section className="card p-5">
        <h2 className="font-semibold">Project</h2>
        <form action={rename} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label className="lbl" htmlFor="name">Name</label>
            <input id="name" name="name" defaultValue={project.name} className="input" />
          </div>
          <button className="btn">Rename</button>
        </form>
        <p className="mt-3 font-mono text-xs text-dim">id {project.id} · slug {project.slug}</p>
      </section>

      <section className="card mt-5 p-5">
        <h2 className="font-semibold">New project</h2>
        <form action={createProject} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label className="lbl" htmlFor="newname">Name</label>
            <input id="newname" name="name" className="input" placeholder="acme-staging" />
          </div>
          <button className="btn-pri">Create</button>
        </form>
      </section>

      <section className="card mt-5 p-5">
        <h2 className="font-semibold">Delivery policy</h2>
        <dl className="mt-3 grid grid-cols-[160px_1fr] gap-y-2 text-sm">
          <dt className="text-ink2">Retry schedule</dt><dd className="font-mono text-xs">{DEFAULT_SCHEDULE_SECONDS.map(fmt).join(" · ")} · then dead-letter</dd>
          <dt className="text-ink2">Jitter</dt><dd className="font-mono text-xs">±{JITTER * 100}%</dd>
          <dt className="text-ink2">Per-attempt timeout</dt><dd className="font-mono text-xs">{env().DELIVERY_TIMEOUT_MS} ms</dd>
          <dt className="text-ink2">Signature</dt><dd className="font-mono text-xs">HMAC-SHA256 · Tether-Signature · tolerance {SIGNATURE_TOLERANCE_SECONDS}s</dd>
          <dt className="text-ink2">Not retried</dt><dd className="font-mono text-xs">2xx (done), 3xx and 4xx except 408 / 425 / 429</dd>
        </dl>
      </section>

      <section className="card mt-5 overflow-hidden">
        <div className="card-h">Audit log <span className="ml-auto normal-case tracking-normal">last {log.length}</span></div>
        {log.length === 0 ? (
          <p className="p-6 text-center text-sm text-dim">Nothing yet. Changes made in the dashboard or via the API show up here.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {log.map((e) => (
              <li key={e.id} className="grid gap-x-4 gap-y-0.5 px-5 py-2.5 sm:grid-cols-[150px_1fr_auto]">
                <span className="font-mono text-xs text-acc">{e.action}</span>
                <span className="min-w-0 truncate font-mono text-xs text-ink2">{e.target ?? ""}{e.detail ? " · " + JSON.stringify(e.detail).slice(0, 80) : ""}</span>
                <span className="text-right"><span className="mr-2 font-mono text-[11px] text-dim">{e.actor}</span><Time d={e.createdAt} /></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
