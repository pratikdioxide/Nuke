import Link from "next/link";
import ProjectGrid from "@/components/ProjectGrid";
import { getOrigin } from "@/lib/auth";
import { listProjects } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const metadata = { title: "Projects" };

export default async function Dashboard() {
  const [projects, origin] = await Promise.all([listProjects(), getOrigin()]);
  return (
    <>
      <div className="page-head">
        <div><h1>Projects</h1><p className="sub">{projects.length} site{projects.length === 1 ? "" : "s"} hosted</p></div>
        <Link href="/dashboard/new" className="btn btn-primary">+ New project</Link>
      </div>
      <ProjectGrid projects={JSON.parse(JSON.stringify(projects))} host={origin.replace(/^https?:\/\//, "")} />
    </>
  );
}
