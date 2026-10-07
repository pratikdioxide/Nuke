import { notFound } from "next/navigation";
import RefreshButton from "@/components/RefreshButton";
import { q } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { timeAgo } from "@/lib/shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Function logs" };

type Row = { id: string; ts: string; method: string; path: string; status: number; duration_ms: number; output: string };

export default async function Logs({ params }: { params: Promise<{ slug: string }> }) {
  const project = await getProject((await params).slug);
  if (!project) notFound();
  const rows = await q<Row>("SELECT id, ts, method, path, status, duration_ms, output FROM nuke_fn_logs WHERE project_id=$1 ORDER BY id DESC LIMIT 100", [project.id]);
  return (
    <div className="card">
      <div className="card-head">
        <div><h2>Function logs</h2><span className="hint">Calls to your api/ functions. Last 100 are kept. console.log output and errors appear here.</span></div>
        <RefreshButton />
      </div>
      {rows.length === 0 ? (
        <p className="sub card-pad" style={{ margin: 0 }}>No function calls yet. Put a file like <code className="i">api/hello.js</code> in your project, deploy, then open <code className="i">/{project.slug}/api/hello</code>.</p>
      ) : (
        <div className="list">
          {rows.map((r) => (
            <details key={r.id} className="item" style={{ display: "block" }}>
              <summary style={{ cursor: "pointer", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span className={`badge ${r.status < 400 ? "ok" : "err"}`}>{r.status}</span>
                <span className="mono">{r.method}</span>
                <span className="mono" style={{ overflowWrap: "anywhere", flex: 1 }}>{r.path}</span>
                <span className="hint">{r.duration_ms} ms · {timeAgo(r.ts)}</span>
              </summary>
              {r.output
                ? <pre className="mono logs" style={{ margin: "12px 0 0", padding: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.output}</pre>
                : <p className="hint" style={{ margin: "10px 0 0" }}>No output.</p>}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
