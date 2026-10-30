import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/session";
import { currentProject } from "@/lib/project";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) redirect("/login");
  const { project, all } = await currentProject();
  return (
    <div className="flex min-h-screen">
      <Sidebar project={project} projects={all.length ? all : [project]} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-10">{children}</div>
      </main>
    </div>
  );
}
