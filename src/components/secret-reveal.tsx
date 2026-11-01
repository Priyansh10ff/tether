"use client";
import { useState, useTransition } from "react";

/** The secret is not in the page HTML. It is fetched on demand through a server action and shown until the page is left. */
export function SecretReveal({ reveal, masked }: { reveal: () => Promise<string>; masked: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <code className="block select-all break-all rounded-md bg-bg px-3 py-2 font-mono text-xs">{secret ?? masked}</code>
      <div className="mt-2 flex gap-2">
        {secret === null ? (
          <button className="btn btn-sm" disabled={pending} onClick={() => start(async () => setSecret(await reveal()))}>{pending ? "…" : "Reveal"}</button>
        ) : (
          <>
            <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(secret).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}>{copied ? "Copied" : "Copy"}</button>
            <button className="btn btn-sm" onClick={() => setSecret(null)}>Hide</button>
          </>
        )}
      </div>
    </div>
  );
}
