"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#f4f6fa", color: "#0f1218" }}>
        <div style={{ maxWidth: 440, padding: 28, background: "#fff", border: "1px solid #e3e7ee", borderRadius: 14 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>Tether hit an unexpected error</h1>
          <p style={{ color: "#4d5565", fontSize: 14 }}>Reload, and if it keeps happening check the server log{error.digest ? ` for digest ${error.digest}` : ""}.</p>
          <button onClick={reset} style={{ background: "#2447ff", color: "#fff", border: 0, borderRadius: 10, padding: "9px 16px", fontWeight: 600 }}>Reload</button>
        </div>
      </body>
    </html>
  );
}
