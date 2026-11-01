"use client";
import { useRouter } from "next/navigation";

/** A table row that navigates on click but keeps its cells selectable and inner links/buttons working. */
export function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className="cursor-pointer"
      tabIndex={0}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest("a,button,input,select,textarea,form")) return;
        if (window.getSelection()?.toString()) return;
        router.push(href);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
