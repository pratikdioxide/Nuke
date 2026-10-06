import { guard } from "@/lib/auth";
import { q } from "@/lib/db";
import { encryptSecret, validateSecretName, validateSecretValue } from "@/lib/private-secrets";
import { readJsonLimited, RequestBodyError } from "@/lib/request-body";
import { getProject } from "@/lib/projects";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Context) {
  const denied = await guard(req);
  if (denied) return denied;
  const project = await getProject((await params).slug);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  const secrets = await q<{ name: string; created_at: string; updated_at: string }>(
    `SELECT name, created_at, updated_at
     FROM nuke_project_secrets WHERE project_id=$1 ORDER BY name`,
    [project.id],
  );
  return Response.json({ secrets });
}

export async function POST(req: Request, { params }: Context) {
  const denied = await guard(req);
  if (denied) return denied;
  const project = await getProject((await params).slug);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  let body: { name?: unknown; value?: unknown };
  try {
    body = await readJsonLimited(req, 16 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Could not read the request." }, { status: 400 });
  }

  let name: string;
  let value: string;
  try {
    name = validateSecretName(body.name);
    value = validateSecretValue(body.value);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }

  let encryptedValue: string;
  try {
    encryptedValue = encryptSecret(project.id, name, value);
  } catch (error) {
    const message = (error as Error).message;
    return Response.json(
      { error: message.includes("not configured") ? "Private secrets are not configured on this server." : "Could not secure this secret." },
      { status: 503 },
    );
  }

  const existing = (await q<{ name: string }>(
    "SELECT name FROM nuke_project_secrets WHERE project_id=$1 AND name=$2",
    [project.id, name],
  ))[0];
  await q(
    `INSERT INTO nuke_project_secrets (project_id, name, encrypted_value)
     VALUES ($1, $2, $3)
     ON CONFLICT (project_id, name)
     DO UPDATE SET encrypted_value=EXCLUDED.encrypted_value, updated_at=NOW()`,
    [project.id, name, encryptedValue],
  );
  return Response.json({ ok: true, name, replaced: Boolean(existing) });
}
