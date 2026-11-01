import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="card w-full max-w-md p-8 text-center shadow-pop">
        <p className="font-mono text-xs text-dim">404</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Nothing at this address</h1>
        <p className="mt-2 text-sm text-ink2">The event, endpoint or page you followed does not exist in this project, or was deleted.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/overview" className="btn-pri">Overview</Link>
          <Link href="/events" className="btn">Events</Link>
        </div>
      </div>
    </main>
  );
}
