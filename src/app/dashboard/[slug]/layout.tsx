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
  const siteUrl = `/${project.slug}/`;
  return (
    <div className="project-workspace">
      <aside className="project-sidebar" aria-label={`${project.name} project navigation`}>
        <Link href="/dashboard" className="project-home">
          <span className="project-home-mark" aria-hidden="true">←</span>
          <span>All projects</span>
        </Link>
        <div className="project-identity">
          <div className="hint">Project</div>
          <h1>{project.name}</h1>
          <a className="url mono" href={siteUrl} target="_blank" rel="noopener noreferrer">{origin.replace(/^https?:\/\//, "")}/{project.slug}</a>
        </div>
        <Tabs slug={project.slug} />
        {project.active_deployment_id && (
          <a className="btn btn-primary project-visit" href={siteUrl} target="_blank" rel="noopener noreferrer">
            Visit site <span aria-hidden="true">↗</span>
          </a>
        )}
      </aside>
      <section className="project-content" aria-label="Project workspace">{children}</section>
    </div>
  );
}
