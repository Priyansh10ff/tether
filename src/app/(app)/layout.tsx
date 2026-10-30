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
      <main className="min-w-0 flex-1 px-6 py-7 lg:px-10">{children}</main>
    </div>
  );
}
