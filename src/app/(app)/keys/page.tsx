import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { newApiKey } from "@/lib/apikeys";
import { newId } from "@/lib/ids";
import { currentProject } from "@/lib/project";
import { PageHeader } from "@/components/page-header";
import { Time } from "@/components/time";
import { cookies } from "next/headers";

export const metadata = { title: "API keys" };

const FLASH = "tether_new_key";

async function createKey(formData: FormData) {
  "use server";
  const { project } = await currentProject();
  const name = String(formData.get("name") ?? "").trim() || "unnamed";
  const { key, prefix, hash } = newApiKey();
  await db.insert(apiKeys).values({ id: newId.apiKey(), projectId: project.id, name, prefix, hash });
  // Show the full key exactly once, on the next render.
  (await cookies()).set(FLASH, key, { path: "/keys", maxAge: 60, httpOnly: true, sameSite: "lax" });
  revalidatePath("/keys");
}

async function revokeKey(formData: FormData) {
  "use server";
  const { project } = await currentProject();
  await db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, String(formData.get("id"))), eq(apiKeys.projectId, project.id)));
  revalidatePath("/keys");
}

export default async function KeysPage() {
  const { project } = await currentProject();
  const jar = await cookies();
  const fresh = jar.get(FLASH)?.value;
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.projectId, project.id)).orderBy(desc(apiKeys.createdAt));

  return (
    <div>
      <PageHeader title="API keys" sub="Your app sends events with Authorization: Bearer <key>." />

      {fresh && (
        <div className="card mb-6 border-acc/40 p-4">
          <p className="text-sm font-medium">New key created. Copy it now; it will not be shown again.</p>
          <code className="mt-2 block select-all rounded-md bg-bg px-3 py-2 font-mono text-sm">{fresh}</code>
          <form action={clearFlash} className="mt-2"><button className="text-xs text-ink2 hover:text-ink">Done, hide it</button></form>
        </div>
      )}

      <form action={createKey} className="card mb-6 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1">
          <label className="lbl" htmlFor="name">Name</label>
          <input id="name" name="name" className="input" placeholder="backend-prod" />
        </div>
        <button className="btn-pri">Create key</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th className="th">Name</th><th className="th">Key</th><th className="th">Last used</th><th className="th">Created</th><th className="th"></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td className="td py-8 text-center text-dim" colSpan={5}>No keys yet. Create one to start sending events.</td></tr>}
            {rows.map((k) => (
              <tr key={k.id}>
                <td className="td font-medium">{k.name}{k.revokedAt && <span className="pill ml-2 bg-bad/10 text-bad">revoked</span>}</td>
                <td className="td font-mono text-xs text-ink2">{k.prefix}…</td>
                <td className="td"><Time d={k.lastUsedAt} /></td>
                <td className="td"><Time d={k.createdAt} /></td>
                <td className="td text-right">
                  {!k.revokedAt && (
                    <form action={revokeKey}><input type="hidden" name="id" value={k.id} /><button className="btn-danger btn-sm">Revoke</button></form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function clearFlash() {
  "use server";
  (await cookies()).delete({ name: FLASH, path: "/keys" });
  revalidatePath("/keys");
}
