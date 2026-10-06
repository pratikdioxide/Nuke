import { guard, originFromRequest } from "@/lib/auth";
import { promote, redeploy } from "@/lib/deploy";
import { q } from "@/lib/db";
import { getProject } from "@/lib/projects";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; n: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const { slug, n } = await params;
  const project = await getProject(slug);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  const { action } = await req.json().catch(() => ({}));
  const number = Number(n);
  try {
    if (action === "promote") {
      await promote(project, number);
      return Response.json({ ok: true, number });
    }
    if (action === "redeploy") {
      const rows = await q<{ id: number }>("SELECT id FROM nuke_deployments WHERE project_id=$1 AND number=$2", [project.id, number]);
      if (!rows[0]) return Response.json({ error: "Deployment not found." }, { status: 404 });
      const r = await redeploy(project, rows[0].id, originFromRequest(req), `Redeploy of #${number}`);
      return Response.json(r, { status: r.ok ? 201 : 422 });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
