"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const on = path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`rounded-md px-2.5 py-1.5 text-sm transition ${on ? "bg-bg text-ink shadow-[inset_0_0_0_1px_var(--color-line)]" : "text-ink2 hover:bg-bg hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}
