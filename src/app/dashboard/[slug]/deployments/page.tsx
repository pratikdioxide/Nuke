import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui";
import { getProject, listDeployments } from "@/lib/projects";
import { formatBytes, timeAgo } from "@/lib/shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deployments" };

export default async function Deployments({ params }: { params: Promise<{ slug: string }> }) {
  const project = await getProject((await params).slug);
  if (!project) notFound();
  const list = await listDeployments(project.id);
  return (
    <div className="card">
      <div className="card-head"><h2>Deployments</h2><span className="hint">Last 15 are kept</span></div>
      {list.length === 0 ? <p className="sub card-pad" style={{ margin: 0 }}>No deployments yet.</p> : (
        <div className="list">
          {list.map((d) => (
            <Link key={d.id} href={`/dashboard/${project.slug}/deployments/${d.number}`} className="item">
              <span className="mono">#{d.number}</span>
              <div>
                <div className="t">{d.message || "Deployment"}</div>
                <div className="s">{d.source} · {timeAgo(d.created_at)}{d.status === "READY" ? ` · ${d.file_count} files · ${formatBytes(Number(d.total_bytes))}` : ""}</div>
              </div>
              <div className="row">
                {d.id === project.active_deployment_id && <StatusBadge status={null} prod />}
                <StatusBadge status={d.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
