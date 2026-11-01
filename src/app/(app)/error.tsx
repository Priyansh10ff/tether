"use client";
import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="card w-full max-w-lg p-7 shadow-pop">
        <div className="pill bg-bad/10 text-bad">error</div>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">This page failed to render</h1>
        <p className="mt-2 text-sm text-ink2">The rest of the dashboard still works. The server log has the full stack trace{error.digest ? <> under digest <code className="font-mono text-ink">{error.digest}</code></> : null}.</p>
        <div className="mt-5 flex gap-2">
          <button onClick={reset} className="btn-pri">Try again</button>
          <a href="/overview" className="btn">Overview</a>
        </div>
      </div>
    </div>
  );
}
