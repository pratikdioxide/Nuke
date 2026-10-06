import Link from "next/link";
import { notFound } from "next/navigation";
import Tabs from "@/components/Tabs";
import { getOrigin } from "@/lib/auth";
import { getProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [project, origin] = await Promise.all([getProject(slug), getOrigin()]);
  if (!project) notFound();
  return (
    <>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <div className="hint"><Link href="/dashboard">Projects</Link> / {project.slug}</div>
          <h1>{project.name}</h1>
          <a className="url mono" href={`/${project.slug}/`} target="_blank" rel="noopener">{origin.replace(/^https?:\/\//, "")}/{project.slug} ↗</a>
        </div>
        {project.active_deployment_id && <a className="btn btn-primary" href={`/${project.slug}/`} target="_blank" rel="noopener">Visit ↗</a>}
      </div>
      <Tabs slug={project.slug} />
      {children}
    </>
  );
}
