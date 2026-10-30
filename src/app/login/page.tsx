import { redirect } from "next/navigation";
import { adminPasswordOk, createSession, isAuthenticated } from "@/lib/session";

async function login(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  if (!adminPasswordOk(password)) redirect("/login?error=1");
  await createSession();
  redirect("/overview");
}

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAuthenticated()) redirect("/overview");
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-white shadow-[0_8px_20px_-8px_rgba(15,18,24,.6)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
              <circle cx="5" cy="12" r="2.5" /><circle cx="19" cy="6" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M7.3 11 16.7 6.8M7.3 13l9.4 4.2" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight">Tether</span>
        </div>
        <form action={login} className="card p-7 shadow-pop">
          <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-ink2">Use the admin password from your <code className="font-mono text-ink">.env</code>.</p>
          <label className="lbl mt-6" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required autoFocus className="input font-mono" />
          {error && <p className="mt-2 text-sm text-bad">That password is not right.</p>}
          <button className="btn-pri mt-5 w-full justify-center">Continue</button>
        </form>
        <p className="mt-5 text-center font-mono text-[11px] text-dim">self-hosted · github.com/Priyansh10ff/tether</p>
      </div>
    </main>
  );
}
