import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { newId } from "@/lib/ids";

const COOKIE = "tether_project";

/** The project the dashboard is scoped to. Creates a default one on first run. */
export async function currentProject() {
  const all = await db.select().from(projects).orderBy(asc(projects.createdAt));
  if (all.length === 0) {
    const id = newId.project();
    await db.insert(projects).values({ id, name: "Default", slug: "default" });
    return { project: (await db.query.projects.findFirst({ where: eq(projects.id, id) }))!, all: [] };
  }
  const wanted = (await cookies()).get(COOKIE)?.value;
  const project = all.find((p) => p.id === wanted) ?? all[0];
  return { project, all };
}

export async function setCurrentProject(id: string) {
  (await cookies()).set(COOKIE, id, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
}
