import Link from "next/link";
import { notFound } from "next/navigation";
import Uploader from "@/components/Uploader";
import { RedeployButton } from "@/components/ProjectActions";
import { StatusBadge } from "@/components/ui";
import { getProject, listDeployments } from "@/lib/projects";
import { formatBytes, timeAgo } from "@/lib/shared";

export const dynamic = "force-dynamic";

export default async function Overview({ params }: { params: Promise<{ slug: string }> }) {
  const project = await getProject((await params).slug);
  if (!project) notFound();
  const deployments = await listDeployments(project.id);
  const active = deployments.find((d) => d.id === project.active_deployment_id);
  const latest = deployments[0];
  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h2>Production</h2>
          <StatusBadge status={active ? "READY" : latest?.status ?? null} />
        </div>
        <div className="card-pad">
          {active ? (
            <dl className="kv" style={{ margin: 0 }}>
              <div><dt>Deployment</dt><dd><Link href={`/dashboard/${project.slug}/deployments/${active.number}`} style={{ textDecoration: "underline" }}>#{active.number}</Link></dd></div>
              <div><dt>Deployed</dt><dd>{timeAgo(active.created_at)}</dd></div>
              <div><dt>Source</dt><dd>{active.source}{active.message ? ` · ${active.message}` : ""}</dd></div>
              <div><dt>Files</dt><dd>{active.file_count} · {formatBytes(Number(active.total_bytes))}</dd></div>
            </dl>
          ) : <p className="sub" style={{ margin: 0 }}>Nothing is live yet. Deploy below.{latest?.status === "ERROR" && <> The last attempt failed, <Link href={`/dashboard/${project.slug}/deployments/${latest.number}`} style={{ textDecoration: "underline" }}>see the logs</Link>.</>}</p>}
          {active && <div className="row" style={{ marginTop: 16 }}>
            <Link className="btn btn-sm" href={`/dashboard/${project.slug}/deployments/${active.number}`}>View logs</Link>
            <RedeployButton slug={project.slug} number={active.number} />
          </div>}
        </div>
      </div>
      {latest && latest.status === "ERROR" && active && latest.id !== active.id && (
        <div className="notice warn">Latest deployment #{latest.number} failed. The site is still serving #{active.number}. <Link href={`/dashboard/${project.slug}/deployments/${latest.number}`} style={{ textDecoration: "underline" }}>View logs</Link></div>
      )}
      <div className="card card-pad">
        <h2>Deploy a new version</h2>
        <Uploader existing slug={project.slug} git={project.git_repo ? { repo: project.git_repo, branch: project.git_branch ?? "", dir: project.git_dir ?? "" } : null} />
      </div>
    </div>
  );
}
