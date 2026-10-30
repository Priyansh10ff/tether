import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/session";
import { currentProject } from "@/lib/project";
import { checkDb } from "@/lib/dbcheck";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { DbDown } from "@/components/db-down";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) redirect("/login");
  const status = await checkDb();
  if (!status.ok) return <DbDown status={status} />;
  const { project, all } = await currentProject();
  return (
    <div className="flex min-h-screen">
      <Sidebar project={project} projects={all.length ? all : [project]} />
      <div className="min-w-0 flex-1">
        <MobileNav projectName={project.name} />
        <main className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-10">{children}</main>
      </div>
    </div>
  );
}
