import { guard, originFromRequest } from "@/lib/auth";
import { redeploy } from "@/lib/deploy";
import { listEnv, parseEnvInput, saveEnv } from "@/lib/env-vars";
import { getProject } from "@/lib/projects";

export const maxDuration = 30;
type Ctx = { params: Promise<{ slug: string }> };

// Names, notes and visibility only. Values are never returned here.
export async function GET(req: Request, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const project = await getProject((await params).slug);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  return Response.json({ vars: await listEnv(project.id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const project = await getProject((await params).slug);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  try {
    const { publicChanged } = await saveEnv(project.id, parseEnvInput(body.vars));
    // Public values live inside the deployed pages, so changing them needs a redeploy.
    // Private values are read live by functions and apply immediately.
    if (publicChanged && project.active_deployment_id) {
      const r = await redeploy(project, null, originFromRequest(req), "Public environment variables changed", "env");
      return Response.json({ ok: r.ok, number: r.number, redeployed: true }, { status: r.ok ? 200 : 422 });
    }
    return Response.json({ ok: true, number: null, redeployed: false });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
