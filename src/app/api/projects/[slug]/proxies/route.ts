import { randomBytes } from "node:crypto";
import { guard } from "@/lib/auth";
import { q } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { validateProxyDefinition, type ApiProxy } from "@/lib/proxy-config";
import { readJsonLimited, RequestBodyError } from "@/lib/request-body";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };
const PROXY_COLUMNS = "id, project_id, name, origin, path_prefix, allowed_methods, secret_name, secret_header, secret_prefix, created_at, updated_at";

async function parseDefinition(req: Request) {
  try {
    return { definition: validateProxyDefinition(await readJsonLimited(req, 16 * 1024)) };
  } catch (error) {
    return {
      error: (error as Error).message,
      status: error instanceof RequestBodyError ? error.status : 400,
    };
  }
}

async function secretExists(projectId: number, name: string): Promise<boolean> {
  return Boolean((await q("SELECT 1 FROM nuke_project_secrets WHERE project_id=$1 AND name=$2", [projectId, name]))[0]);
}

export async function GET(req: Request, { params }: Context) {
  const denied = await guard(req);
  if (denied) return denied;
  const project = await getProject((await params).slug);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  const proxies = await q<ApiProxy>(
    `SELECT ${PROXY_COLUMNS} FROM nuke_api_proxies
     WHERE project_id=$1 ORDER BY name`,
    [project.id],
  );
  return Response.json({ proxies });
}

export async function POST(req: Request, { params }: Context) {
  const denied = await guard(req);
  if (denied) return denied;
  const project = await getProject((await params).slug);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  const parsed = await parseDefinition(req);
  if (!parsed.definition) return Response.json({ error: parsed.error }, { status: parsed.status });
  const definition = parsed.definition;
  if (!await secretExists(project.id, definition.secret_name)) {
    return Response.json({ error: "Save that private secret before creating the proxy." }, { status: 400 });
  }

  const id = randomBytes(18).toString("base64url");
  try {
    const [proxy] = await q<ApiProxy>(
      `INSERT INTO nuke_api_proxies
         (id, project_id, name, origin, path_prefix, allowed_methods, secret_name, secret_header, secret_prefix)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING ${PROXY_COLUMNS}`,
      [id, project.id, definition.name, definition.origin, definition.path_prefix, definition.allowed_methods, definition.secret_name, definition.secret_header, definition.secret_prefix],
    );
    return Response.json({ proxy }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "23505") return Response.json({ error: "A proxy with that name already exists." }, { status: 409 });
    return Response.json({ error: "Could not create the proxy." }, { status: 500 });
  }
}
