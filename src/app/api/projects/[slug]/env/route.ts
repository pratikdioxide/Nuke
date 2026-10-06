import { guard, originFromRequest } from "@/lib/auth";
import { redeploy } from "@/lib/deploy";
import { q } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { validateEnvVars } from "@/lib/shared";

export const maxDuration = 30;

export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const project = await getProject((await params).slug);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  let env;
  try { env = validateEnvVars(body.vars); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  await q("UPDATE nuke_projects SET public_env=$1::jsonb, updated_at=NOW() WHERE id=$2", [JSON.stringify(env), project.id]);
  if (!project.active_deployment_id) return Response.json({ ok: true, number: null });
  const r = await redeploy({ ...project, public_env: env }, null, originFromRequest(req), "Environment variables changed", "env");
  return Response.json({ ok: r.ok, number: r.number }, { status: r.ok ? 200 : 422 });
}
