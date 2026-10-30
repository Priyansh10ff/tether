import Link from "next/link";

const NAV = [["Overview", "/overview"], ["Events", "/events"], ["Endpoints", "/endpoints"], ["Dead letters", "/dead-letters"], ["API keys", "/keys"], ["Settings", "/settings"]] as const;

export function MobileNav({ projectName }: { projectName: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white/80 px-4 backdrop-blur-xl md:hidden">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-white">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden><circle cx="5" cy="12" r="2.5" /><circle cx="19" cy="6" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M7.3 11 16.7 6.8M7.3 13l9.4 4.2" /></svg>
      </span>
      <span className="font-semibold">Tether</span>
      <span className="font-mono text-xs text-dim">{projectName}</span>
      <details className="relative ml-auto">
        <summary className="btn btn-sm list-none cursor-pointer">Menu</summary>
        <nav className="absolute right-0 mt-2 flex w-48 flex-col rounded-xl border border-line bg-white p-1.5 shadow-pop">
          {NAV.map(([label, href]) => (
            <Link key={href} href={href} className="rounded-lg px-3 py-2 text-sm hover:bg-bg">{label}</Link>
          ))}
        </nav>
      </details>
    </header>
  );
}
