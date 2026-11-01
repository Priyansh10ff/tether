"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-render the server component tree every `ms` while the tab is visible. Cheap: it re-runs the page query, nothing else. */
export function AutoRefresh({ ms = 3000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!t) t = setInterval(() => router.refresh(), ms); };
    const stop = () => { if (t) { clearInterval(t); t = null; } };
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [router, ms]);
  return null;
}
