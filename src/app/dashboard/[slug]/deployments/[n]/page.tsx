import Link from "next/link";
import { notFound } from "next/navigation";
import { DeploymentActions } from "@/components/ProjectActions";
import { LogView, StatusBadge } from "@/components/ui";
import { getDeployment, getFiles, getProject } from "@/lib/projects";
import { formatBytes, timeAgo } from "@/lib/shared";

export const dynamic = "force-dynamic";

export default async function DeploymentPage({ params }: { params: Promise<{ slug: string; n: string }> }) {
  const { slug, n } = await params;
  const project = await getProject(slug);
  if (!project || !/^\d+$/.test(n)) notFound();
  const d = await getDeployment(project.id, Number(n));
  if (!d) notFound();
  const files = d.status === "READY" ? await getFiles(d.id) : [];
  const isProd = d.id === project.active_deployment_id;
  return (
    <div className="stack">
      <div className="hint"><Link href={`/dashboard/${project.slug}/deployments`}>← All deployments</Link></div>
      <div className="card card-pad stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Deployment #{d.number}</h2>
          <div className="row">{isProd && <StatusBadge status={null} prod />}<StatusBadge status={d.status} /></div>
        </div>
        <dl className="kv" style={{ margin: 0 }}>
          <div><dt>Message</dt><dd>{d.message || "—"}</dd></div>
          <div><dt>Source</dt><dd>{d.source}</dd></div>
          <div><dt>Created</dt><dd>{timeAgo(d.created_at)}</dd></div>
          <div><dt>Duration</dt><dd>{d.duration_ms} ms</dd></div>
          <div><dt>Files</dt><dd>{d.file_count} · {formatBytes(Number(d.total_bytes))}</dd></div>
          <div><dt>Env variables</dt><dd>{Object.keys(d.env || {}).length}</dd></div>
        </dl>
        <DeploymentActions slug={project.slug} number={d.number} isProduction={isProd} ready={d.status === "READY"} />
      </div>
      <div>
        <h2>Build logs</h2>
        <LogView logs={d.logs} />
      </div>
      {files.length > 0 && (
        <details className="card">
          <summary className="card-head" style={{ cursor: "pointer" }}><span>Files ({files.length})</span></summary>
          <div className="list mono" style={{ fontSize: 12.5 }}>
            {files.map((f) => <div key={f.path} className="item" style={{ gridTemplateColumns: "1fr auto" }}><span style={{ overflowWrap: "anywhere" }}>{f.path}</span><span className="hint">{formatBytes(f.size)}</span></div>)}
          </div>
        </details>
      )}
    </div>
  );
}
