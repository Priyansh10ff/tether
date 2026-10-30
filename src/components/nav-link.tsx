"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, icon, children }: { href: string; icon: string; children: React.ReactNode }) {
  const path = usePathname();
  const on = path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`group flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13.5px] transition ${on ? "bg-white font-medium text-ink shadow-[0_1px_2px_rgba(15,18,24,.06),inset_0_0_0_1px_var(--color-line)]" : "text-ink2 hover:bg-white/70 hover:text-ink"}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={on ? "text-acc" : "text-dim group-hover:text-ink2"} aria-hidden>
        <path d={icon} />
      </svg>
      {children}
    </Link>
  );
}
