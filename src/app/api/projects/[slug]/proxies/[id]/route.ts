import { guard } from "@/lib/auth";
import { q } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { validateProxyDefinition, type ApiProxy } from "@/lib/proxy-config";
import { readJsonLimited, RequestBodyError } from "@/lib/request-body";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string; id: string }> };
const PROXY_COLUMNS = "id, project_id, name, origin, path_prefix, allowed_methods, secret_name, secret_header, secret_prefix, created_at, updated_at";

export async function PATCH(req: Request, { params }: Context) {
  const denied = await guard(req);
  if (denied) return denied;
  const { slug, id } = await params;
  const project = await getProject(slug);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  const current = (await q<{ id: string }>(
    "SELECT id FROM nuke_api_proxies WHERE project_id=$1 AND id=$2",
    [project.id, id],
  ))[0];
  if (!current) return Response.json({ error: "Proxy not found." }, { status: 404 });

  let definition;
  try {
    definition = validateProxyDefinition(await readJsonLimited(req, 16 * 1024));
  } catch (error) {
    return Response.json({
      error: (error as Error).message,
    }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
  const secret = (await q(
    "SELECT 1 FROM nuke_project_secrets WHERE project_id=$1 AND name=$2",
    [project.id, definition.secret_name],
  ))[0];
  if (!secret) return Response.json({ error: "Save that private secret before assigning it to the proxy." }, { status: 400 });

  try {
    const [proxy] = await q<ApiProxy>(
      `UPDATE nuke_api_proxies
       SET name=$1, origin=$2, path_prefix=$3, allowed_methods=$4, secret_name=$5,
           secret_header=$6, secret_prefix=$7, updated_at=NOW()
       WHERE project_id=$8 AND id=$9
       RETURNING ${PROXY_COLUMNS}`,
      [definition.name, definition.origin, definition.path_prefix, definition.allowed_methods, definition.secret_name, definition.secret_header, definition.secret_prefix, project.id, id],
    );
    if (!proxy) return Response.json({ error: "Proxy not found." }, { status: 404 });
    return Response.json({ proxy });
  } catch (error: any) {
    if (error?.code === "23505") return Response.json({ error: "A proxy with that name already exists." }, { status: 409 });
    return Response.json({ error: "Could not update the proxy." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Context) {
  const denied = await guard(req);
  if (denied) return denied;
  const { slug, id } = await params;
  const project = await getProject(slug);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  const result = await q(
    "DELETE FROM nuke_api_proxies WHERE project_id=$1 AND id=$2 RETURNING id",
    [project.id, id],
  );
  if (!result.length) return Response.json({ error: "Proxy not found." }, { status: 404 });
  return Response.json({ ok: true });
}
