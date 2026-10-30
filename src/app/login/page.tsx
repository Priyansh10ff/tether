import { redirect } from "next/navigation";
import { adminPasswordOk, createSession, isAuthenticated } from "@/lib/session";

async function login(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  if (!adminPasswordOk(password)) redirect("/login?error=1");
  await createSession();
  redirect("/overview");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAuthenticated()) redirect("/overview");
  const { error } = await searchParams;
  return (
    <main className="min-h-screen grid place-items-center px-4">
      <form action={login} className="w-full max-w-sm rounded-xl border border-line bg-white p-7 shadow-soft">
        <div className="flex items-center gap-2 font-semibold">
          <Logo /> Tether
        </div>
        <h1 className="mt-6 text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-ink2">Use the admin password from your <code className="font-mono">.env</code>.</p>
        <label className="mt-5 block text-sm font-medium" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          className="mt-1.5 w-full rounded-lg border border-line2 bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-acc"
        />
        {error && <p className="mt-2 text-sm text-bad">That password is not right.</p>}
        <button className="btn-pri mt-5 w-full justify-center">Continue</button>
      </form>
    </main>
  );
}

function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="5" cy="12" r="2.5" /><circle cx="19" cy="6" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M7.3 11 16.7 6.8M7.3 13l9.4 4.2" />
    </svg>
  );
}
